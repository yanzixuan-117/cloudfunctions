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
