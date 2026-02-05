// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 发送订阅消息
 * @param {string} touser - 接收者openid
 * @param {string} templateId - 模板ID
 * @param {string} page - 点击跳转的小程序页面路径
 * @param {object} data - 模板数据
 */
async function sendSubscribeMessage(touser, templateId, page, data) {
  try {
    const result = await cloud.openapi.subscribeMessage.send({
      touser: touser,
      templateId: templateId,
      page: page,
      data: data
    })

    console.log('发送订阅消息成功:', result)
    return result
  } catch (err) {
    console.error('发送订阅消息失败:', err)
    throw err
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { type, bookingId, recipientOpenid } = event

  console.log('=== 发送订阅消息云函数开始 ===')
  console.log('消息类型:', type)
  console.log('预约ID:', bookingId)
  console.log('接收者:', recipientOpenid)

  try {
    // 获取预约信息
    const bookingRes = await db.collection('bookings').doc(bookingId).get()

    if (!bookingRes.data) {
      return {
        success: false,
        message: '预约记录不存在'
      }
    }

    const booking = bookingRes.data

    // 获取教练信息
    const coachRes = await db.collection('coaches').doc(booking.coachId).get()
    const coach = coachRes.data

    // 获取学员信息
    const studentRes = await db.collection('users').where({
      _openid: db.command.eq(booking.studentId)
    }).get()
    const student = studentRes.data[0] || {}

    // 根据消息类型发送不同的消息
    let templateId = ''
    let page = ''
    let data = {}

    switch (type) {
      case 'new_booking': // 新预约申请（通知教练）
        templateId = 'YOUR_NEW_BOOKING_TEMPLATE_ID' // 需要替换为实际的模板ID
        page = 'pages/booking/coach-list'
        data = {
          thing1: { // 学员昵称
            value: student.nickName || '学员'
          },
          date2: { // 预约日期
            value: booking.date
          },
          time3: { // 预约时间
            value: `${booking.startTime}-${booking.endTime}`
          },
          thing4: { // 球馆名称
            value: booking.venue || '未指定'
          }
        }
        break

      case 'booking_confirmed': // 预约已确认（通知学员）
        templateId = 'YOUR_BOOKING_CONFIRMED_TEMPLATE_ID' // 需要替换为实际的模板ID
        page = `pages/booking/manage?bookingId=${booking._id}`
        data = {
          thing1: { // 教练名称
            value: coach.name
          },
          date2: { // 预约日期
            value: booking.date
          },
          time3: { // 预约时间
            value: `${booking.startTime}-${booking.endTime}`
          },
          thing4: { // 球馆名称
            value: booking.venue || '未指定'
          },
          phrase5: { // 状态
            value: '已确认'
          }
        }
        break

      case 'booking_rejected': // 预约已拒绝（通知学员）
        templateId = 'YOUR_BOOKING_REJECTED_TEMPLATE_ID' // 需要替换为实际的模板ID
        page = `pages/booking/my-bookings`
        data = {
          thing1: { // 教练名称
            value: coach.name
          },
          date2: { // 预约日期
            value: booking.date
          },
          time3: { // 预约时间
            value: `${booking.startTime}-${booking.endTime}`
          },
          thing4: { // 拒绝原因
            value: booking.rejectReason || '教练暂时无法安排'
          }
        }
        break

      case 'booking_cancelled': // 预约已取消（通知教练）
        templateId = 'YOUR_BOOKING_CANCELLED_TEMPLATE_ID' // 需要替换为实际的模板ID
        page = `pages/booking/coach-list`
        data = {
          thing1: { // 学员昵称
            value: student.nickName || '学员'
          },
          date2: { // 预约日期
            value: booking.date
          },
          time3: { // 预约时间
            value: `${booking.startTime}-${booking.endTime}`
          },
          phrase4: { // 状态
            value: '已取消'
          }
        }
        break

      case 'booking_completed': // 预约已完成（通知学员）
        templateId = 'YOUR_BOOKING_COMPLETED_TEMPLATE_ID' // 需要替换为实际的模板ID
        page = `pages/booking/manage?bookingId=${booking._id}`
        data = {
          thing1: { // 教练名称
            value: coach.name
          },
          date2: { // 预约日期
            value: booking.date
          },
          phrase3: { // 状态
            value: '已完成'
          }
        }
        break

      default:
        return {
          success: false,
          message: '无效的消息类型'
        }
    }

    // 发送订阅消息
    await sendSubscribeMessage(recipientOpenid, templateId, page, data)

    return {
      success: true,
      message: '消息发送成功'
    }

  } catch (err) {
    console.error('=== 发送订阅消息失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '消息发送失败：' + err.message
    }
  }
}
