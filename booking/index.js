// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, bookingId } = event

  console.log('=== 预约操作云函数开始 ===')
  console.log('OPENID:', wxContext.OPENID)
  console.log('操作:', action)
  console.log('预约ID:', bookingId)

  try {
    // 查询预约记录
    const bookingRes = await db.collection('bookings').doc(bookingId).get()

    if (!bookingRes.data) {
      return {
        success: false,
        message: '预约记录不存在'
      }
    }

    const booking = bookingRes.data
    console.log('预约状态:', booking.status)

    // 根据不同操作执行不同逻辑
    switch (action) {
      case 'confirm':
        return await confirmBooking(booking, wxContext.OPENID)

      case 'reject':
        return await rejectBooking(booking, wxContext.OPENID, event.rejectReason)

      case 'cancel':
        return await cancelBooking(booking, wxContext.OPENID)

      case 'complete':
        return await completeBooking(booking, wxContext.OPENID)

      case 'updateRecord':
        return await updateRecord(booking, wxContext.OPENID, event.feedback, event.status, event.photos)

      default:
        return {
          success: false,
          message: '无效的操作'
        }
    }

  } catch (err) {
    console.error('=== 预约操作失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '操作失败：' + err.message
    }
  }
}

// 确认预约
async function confirmBooking(booking, openid) {
  // 权限检查：只有教练本人可以确认
  // 先通过 coachId 获取教练的 openid
  const coachRes = await db.collection('coaches').doc(booking.coachId).get()

  if (!coachRes.data) {
    return {
      success: false,
      message: '教练信息不存在'
    }
  }

  if (coachRes.data._openid !== openid) {
    return {
      success: false,
      message: '无权限操作'
    }
  }

  // 状态检查
  if (booking.status !== 'pending') {
    return {
      success: false,
      message: '该预约不能确认'
    }
  }

  // 更新预约状态
  await db.collection('bookings').doc(booking._id).update({
    data: {
      status: 'confirmed',
      confirmTime: db.serverDate()
    }
  })

  // 发送订阅消息给学员（异步，不阻塞）
  try {
    const studentOpenid = booking.studentId
    console.log('准备发送确认通知给学员')
    console.log('学员openid:', studentOpenid)
    console.log('模板ID: 0zah2JhpFWROpt-yud34i9JIyLdubNoTMf8jo7km9N8')

    if (studentOpenid) {
      await cloud.openapi.subscribeMessage.send({
        touser: studentOpenid,
        templateId: '0zah2JhpFWROpt-yud34i9JIyLdubNoTMf8jo7km9N8', // 预约已确认
        page: `pages/booking/manage?bookingId=${booking._id}`,
        data: {
          time1: { // 课程开始时间（time类型，只传时间点）
            value: booking.startTime
          },
          thing2: { // 课程教练
            value: coachRes.data.name
          },
          short_thing3: { // 课程时长
            value: '60分钟'
          },
          thing4: { // 上课地点（只传地点，不超过20字符）
            value: booking.venue || '未指定'
          }
        }
      }).catch(err => {
        console.log('发送学员订阅消息失败（不影响操作）:', err.message)
      })

      console.log('学员确认通知发送完成')
    } else {
      console.log('学员openid为空，无法发送通知')
    }
  } catch (msgErr) {
    console.log('发送学员订阅消息异常（不影响操作）:', msgErr.message)
  }

  return {
    success: true,
    message: '已确认预约'
  }
}

// 拒绝预约
async function rejectBooking(booking, openid, rejectReason) {
  // 权限检查：只有教练本人可以拒绝
  // 先通过 coachId 获取教练的 openid
  const coachRes = await db.collection('coaches').doc(booking.coachId).get()

  if (!coachRes.data) {
    return {
      success: false,
      message: '教练信息不存在'
    }
  }

  if (coachRes.data._openid !== openid) {
    return {
      success: false,
      message: '无权限操作'
    }
  }

  // 状态检查
  if (booking.status !== 'pending') {
    return {
      success: false,
      message: '该预约不能拒绝'
    }
  }

  // 更新预约状态
  await db.collection('bookings').doc(booking._id).update({
    data: {
      status: 'rejected',
      rejectReason: rejectReason || '',
      confirmTime: db.serverDate()
    }
  })

  // 发送订阅消息给学员（异步，不阻塞）
  try {
    const studentOpenid = booking.studentId
    console.log('准备发送拒绝通知给学员')
    console.log('学员openid:', studentOpenid)
    console.log('模板ID: 5vb0wANKEONrKQ_oTAIFFSTSpXcC8y7y6sGDu2Tp8Ik')
    console.log('拒绝原因:', rejectReason || '教练暂时无法安排')

    if (studentOpenid) {
      await cloud.openapi.subscribeMessage.send({
        touser: studentOpenid,
        templateId: '5vb0wANKEONrKQ_oTAIFFSTSpXcC8y7y6sGDu2Tp8Ik', // 预约已拒绝
        page: `pages/booking/my-bookings`,
        data: {
          thing1: { // 上课场馆（只传场馆名称）
            value: booking.venue || '未指定'
          },
          time2: { // 上课时间（time类型，只传开始时间点）
            value: booking.startTime
          },
          thing3: { // 课程名称
            value: '网球课程'
          },
          thing4: { // 上课老师
            value: coachRes.data.name
          },
          thing5: { // 失败原因
            value: rejectReason || '教练暂时无法安排'
          }
        }
      }).catch(err => {
        console.log('发送学员订阅消息失败（不影响操作）:', err.message)
      })

      console.log('学员拒绝通知发送完成')
    } else {
      console.log('学员openid为空，无法发送通知')
    }
  } catch (msgErr) {
    console.log('发送学员订阅消息异常（不影响操作）:', msgErr.message)
  }

  return {
    success: true,
    message: '已拒绝预约'
  }
}

// 取消预约
async function cancelBooking(booking, openid) {
  // 权限检查：学员只能取消自己的预约
  if (booking.studentId !== openid) {
    return {
      success: false,
      message: '无权限操作'
    }
  }

  // 状态检查
  if (booking.status === 'cancelled' || booking.status === 'completed' || booking.status === 'rejected') {
    return {
      success: false,
      message: '该预约不能取消'
    }
  }

  // 时间检查
  if (booking.status === 'confirmed') {
    const now = new Date()
    const bookingDate = new Date(booking.date)
    const [hours, minutes] = booking.startTime.split(':').map(Number)
    bookingDate.setHours(hours, minutes, 0, 0)

    const timeDiff = bookingDate.getTime() - now.getTime()
    const hoursDiff = timeDiff / (1000 * 60 * 60)

    if (hoursDiff < 12) {
      return {
        success: false,
        message: '距离课程开始不足12小时，不能取消'
      }
    }
  }

  // 更新预约状态
  await db.collection('bookings').doc(booking._id).update({
    data: {
      status: 'cancelled'
    }
  })

  // 发送订阅消息给教练（异步，不阻塞）
  try {
    const coachRes = await db.collection('coaches').doc(booking.coachId).get()
    if (coachRes.data && coachRes.data._openid) {
      // 获取学员信息
      const studentRes = await db.collection('users').where({
        _openid: db.command.eq(booking.studentId)
      }).get()
      const student = studentRes.data[0] || {}

      await cloud.openapi.subscribeMessage.send({
        touser: coachRes.data._openid,
        templateId: 'ZK-LyT1dghS8lT_c5j3y7QS3p_GiKhXoWIHmovPbFi4', // 预约已取消
        page: `pages/booking/coach-list`,
        data: {
          thing3: { // 预约项目
            value: '网球课程'
          },
          name4: { // 预约人
            value: student.nickName || '学员'
          },
          thing12: { // 上课地址（包含时间）
            value: `${booking.venue || '未指定'} ${booking.startTime}-${booking.endTime}`
          },
          date13: { // 上课日期（纯日期格式）
            value: booking.date
          }
        }
      }).catch(err => {
        console.log('发送教练订阅消息失败（不影响操作）:', err.message)
      })
    }
  } catch (msgErr) {
    console.log('发送教练订阅消息异常（不影响操作）:', msgErr.message)
  }

  return {
    success: true,
    message: '已取消预约'
  }
}

// 完成预约
async function completeBooking(booking, openid) {
  // 权限检查：只有教练可以完成预约
  // 先通过 coachId 获取教练的 openid
  const coachRes = await db.collection('coaches').doc(booking.coachId).get()

  if (!coachRes.data) {
    return {
      success: false,
      message: '教练信息不存在'
    }
  }

  if (coachRes.data._openid !== openid) {
    return {
      success: false,
      message: '无权限操作'
    }
  }

  // 状态检查
  if (booking.status !== 'confirmed') {
    return {
      success: false,
      message: '该预约不能标记为完成'
    }
  }

  // 更新预约状态
  await db.collection('bookings').doc(booking._id).update({
    data: {
      status: 'completed',
      completeTime: db.serverDate()
    }
  })

  // 更新学员课程的已使用课次和剩余课次
  try {
    // 查找学员的有效课程（status为active且有剩余课次）
    const coursesRes = await db.collection('studentCourses')
      .where({
        studentOpenid: booking.studentId,
        status: 'active',
        remainingSessions: _.gt(0)
      })
      .orderBy('createTime', 'asc') // 按创建时间升序，优先使用最早购买的课程
      .get()

    if (coursesRes.data && coursesRes.data.length > 0) {
      const course = coursesRes.data[0]
      const newUsedSessions = (course.usedSessions || 0) + 1
      const newRemainingSessions = Math.max(0, (course.remainingSessions || 0) - 1)

      // 更新课程课次
      const updateData = {
        usedSessions: newUsedSessions,
        remainingSessions: newRemainingSessions,
        updateTime: db.serverDate()
      }

      // 如果剩余课次为0，将状态设为已完成
      if (newRemainingSessions === 0) {
        updateData.status = 'completed'
      }

      await db.collection('studentCourses').doc(course._id).update({
        data: updateData
      })

      console.log('已更新学员课程课次:', {
        courseId: course._id,
        usedSessions: newUsedSessions,
        remainingSessions: newRemainingSessions
      })
    } else {
      console.log('未找到学员的有效课程，跳过课次更新')
    }
  } catch (courseErr) {
    console.error('更新学员课程课次失败（不影响完成操作）:', courseErr)
  }

  // 发送订阅消息给学员（异步，不阻塞）
  try {
    const studentOpenid = booking.studentId
    if (studentOpenid) {
      // 获取学员信息
      const studentRes = await db.collection('users').where({
        _openid: db.command.eq(booking.studentId)
      }).get()
      const student = studentRes.data && studentRes.data.length > 0 ? studentRes.data[0] : {}

      await cloud.openapi.subscribeMessage.send({
        touser: studentOpenid,
        templateId: 'lw0LVJhfyaZwIR0FFVcmMMZjrFBtlOngUrK-BJpnC6Y', // 预约已完成
        page: `pages/booking/manage?bookingId=${booking._id}`,
        data: {
          thing2: { // 学员姓名
            value: student.nickName || '学员'
          },
          thing6: { // 课程名称
            value: '网球课程'
          },
          time7: { // 上课时间（time类型，只传开始时间点）
            value: booking.startTime
          },
          thing8: { // 教练
            value: coachRes.data.name
          },
          thing9: { // 上课地址（只传地点名称）
            value: booking.venue || '未指定'
          }
        }
      }).catch(err => {
        console.log('发送学员订阅消息失败（不影响操作）:', err.message)
      })
    }
  } catch (msgErr) {
    console.log('发送学员订阅消息异常（不影响操作）:', msgErr.message)
  }

  return {
    success: true,
    message: '预约已完成'
  }
}

// 更新课程记录（反馈、照片、状态）
async function updateRecord(booking, openid, feedback, status, photos) {
  // 权限检查：只有教练可以添加课程记录
  const coachRes = await db.collection('coaches').doc(booking.coachId).get()

  if (!coachRes.data) {
    return {
      success: false,
      message: '教练信息不存在'
    }
  }

  if (coachRes.data._openid !== openid) {
    return {
      success: false,
      message: '无权限操作'
    }
  }

  // 状态检查：只能更新已完成的课程
  if (booking.status !== 'completed') {
    return {
      success: false,
      message: '只能为已完成的课程添加记录'
    }
  }

  // 构建更新数据
  const updateData = {
    feedback: feedback || '',
    photos: photos || [],
    updateTime: db.serverDate()
  }

  // 如果传递了状态参数，也更新状态（允许教练修改课程状态）
  if (status && status !== booking.status) {
    // 只允许在 completed 和 cancelled 之间切换
    if (status === 'completed' || status === 'cancelled') {
      updateData.status = status
    }
  }

  // 更新预约记录
  await db.collection('bookings').doc(booking._id).update({
    data: updateData
  })

  return {
    success: true,
    message: '课程记录已更新'
  }
}
