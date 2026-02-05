// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const dbCmd = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { coachId, date, startTime, endTime, venue, venueId, studentNote, students } = event

  console.log('=== 创建预约云函数开始 ===')
  console.log('OPENID:', wxContext.OPENID)
  console.log('教练ID:', coachId)
  console.log('日期:', date)
  console.log('时间段:', startTime, '-', endTime)
  console.log('球馆:', venue)
  console.log('球馆ID:', venueId)
  console.log('上课人列表:', students)

  try {
    // 1. 检查教练是否存在且状态正常
    const coachRes = await db.collection('coaches').doc(coachId).get()

    if (!coachRes.data) {
      return {
        success: false,
        message: '教练不存在'
      }
    }

    const coach = coachRes.data

    if (coach.status !== 1) {
      return {
        success: false,
        message: '该教练当前不可预约'
      }
    }

    console.log('教练信息:', coach.name)

    // 2. 检查教练在该时间段是否已被预约
    const coachConflictRes = await db.collection('bookings')
      .where({
        coachId: coachId,
        date: date,
        startTime: startTime,
        status: dbCmd.in(['pending', 'confirmed'])
      })
      .get()

    if (coachConflictRes.data.length > 0) {
      console.log('教练时间段冲突')
      return {
        success: false,
        message: '该教练该时段已被预约，请选择其他时间'
      }
    }

    // 3. 检查球馆在该时间段是否已被预约
    const venueConflictRes = await db.collection('bookings')
      .where({
        venue: venue,
        date: date,
        startTime: startTime,
        status: dbCmd.in(['pending', 'confirmed'])
      })
      .get()

    if (venueConflictRes.data.length > 0) {
      console.log('球馆时间段冲突')
      return {
        success: false,
        message: `该球馆该时段已被预约，请选择其他时间或球馆`
      }
    }

    // 4. 创建预约记录
    const bookingData = {
      studentId: wxContext.OPENID,
      coachId: coachId,
      date: date,
      startTime: startTime,
      endTime: endTime,
      venue: venue || '',
      venueId: venueId || '',
      status: 'pending', // 待审核
      studentNote: studentNote || '',
      coachNote: '',
      students: students || [], // 上课人列表
      createTime: db.serverDate()
    }

    console.log('创建预约记录:', bookingData)

    const addRes = await db.collection('bookings').add({
      data: bookingData
    })

    console.log('预约记录创建成功，ID:', addRes._id)

    // 5. 发送订阅消息给教练（异步，不阻塞）
    try {
      const coachOpenid = coach._openid
      console.log('教练openid:', coachOpenid)

      if (coachOpenid) {
        console.log('开始获取学员信息...')

        // 获取学员信息
        const studentRes = await db.collection('users').where({
          _openid: db.command.eq(wxContext.OPENID)
        }).get()

        console.log('学员信息查询结果:', studentRes.data)

        const student = studentRes.data && studentRes.data.length > 0 ? studentRes.data[0] : {}

        console.log('准备发送订阅消息给教练')
        console.log('模板ID: llGk7fAnowILwT_v9l2anVgBfdM3qhI9I04brQw02Z8')
        console.log('接收者openid:', coachOpenid)
        console.log('学员昵称:', student.nickName || '学员')

        await cloud.openapi.subscribeMessage.send({
          touser: coachOpenid,
          templateId: 'llGk7fAnowILwT_v9l2anVgBfdM3qhI9I04brQw02Z8', // 新预约申请通知
          page: 'pages/booking/coach-list',
          data: {
            name1: { // 预约学员（显示学员微信昵称）
              value: student.nickName || '学员'
            },
            date3: { // 预约日期（纯日期格式）
              value: date
            },
            thing2: { // 预约课程
              value: '网球课程'
            },
            thing6: { // 上课地址（包含时间）
              value: `${venue || '未指定'} ${startTime}-${endTime}`
            },
            thing7: { // 预约陪练
              value: coach.name
            }
          }
        }).catch(err => {
          console.log('发送教练订阅消息失败（不影响预约）:', err)

          // 如果是用户未订阅错误（43101），标记教练需要重新授权
          if (err.errCode === 43101) {
            console.log('教练未授权订阅消息，标记需要重新授权')
            db.collection('coaches').doc(coach._id).update({
              data: {
                needReSubscribe: true,
                lastSubscribeFail: new Date()
              }
            }).catch(updateErr => {
              console.log('标记教练重新授权失败:', updateErr.message)
            })
          }
        })

        console.log('教练订阅消息发送完成')
      } else {
        console.log('教练openid为空，无法发送订阅消息')
      }
    } catch (msgErr) {
      console.log('发送教练订阅消息异常（不影响预约）:', msgErr.message)
    }

    // 6. 返回成功结果
    return {
      success: true,
      message: '预约申请已提交，请等待教练确认',
      data: {
        bookingId: addRes._id,
        coachName: coach.name,
        coachPrice: coach.price
      }
    }

  } catch (err) {
    console.error('=== 创建预约失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '创建预约失败：' + err.message
    }
  }
}
