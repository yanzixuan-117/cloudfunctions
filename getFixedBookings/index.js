// 云函数：获取固定预约列表
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 获取固定预约列表
 */
exports.main = async (event, context) => {
  const { id } = event
  const wxContext = cloud.getWXContext()

  console.log('=== 获取固定预约 ===', id)

  try {
    // 如果传入id，获取单条记录
    if (id) {
      const res = await db.collection('fixedBookings').where({
        _id: id,
        _openid: wxContext.OPENID
      }).get()

      if (!res.data || res.data.length === 0) {
        return {
          success: false,
          message: '固定预约不存在'
        }
      }

      const booking = res.data[0]

      // 获取教练信息
      if (booking.coachId) {
        const coachRes = await db.collection('coaches').where({
          _id: booking.coachId
        }).get()

        if (coachRes.data && coachRes.data.length > 0) {
          booking.coachName = coachRes.data[0].name
        }
      }

      // 获取球馆信息
      if (booking.venueId) {
        const venueRes = await db.collection('venues').where({
          _id: booking.venueId
        }).get()

        if (venueRes.data && venueRes.data.length > 0) {
          booking.venueName = venueRes.data[0].name
        }
      }

      return {
        success: true,
        data: booking
      }
    }

    // 获取所有固定预约
    const bookingsRes = await db.collection('fixedBookings').where({
      _openid: wxContext.OPENID
    }).orderBy('createTime', 'desc').get()

    const bookings = bookingsRes.data || []

    // 获取所有教练信息
    const coachesRes = await db.collection('coaches').where({
      status: 1
    }).get()

    const coaches = coachesRes.data || []
    const coachMap = {}
    coaches.forEach(c => {
      coachMap[c._id] = c
    })

    // 获取所有球馆信息
    const venuesRes = await db.collection('venues').get()
    const venues = venuesRes.data || []
    const venueMap = {}
    venues.forEach(v => {
      venueMap[v._id] = v
    })

    // 补充教练和球馆名称及格式化数据
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

    bookings.forEach(booking => {
      const coach = coachMap[booking.coachId]
      booking.coachName = coach ? coach.name : '未知教练'

      const venue = venueMap[booking.venueId]
      booking.venueName = venue ? venue.name : '未指定'

      booking.weekdayText = weekdays[booking.weekday] || '未知'

      // 格式化有效期
      if (booking.validUntil) {
        booking.validUntilText = booking.validUntil.split('T')[0]
      } else {
        booking.validUntilText = '永久有效'
      }

      // 时间范围
      booking.timeRange = `${booking.startTime}-${booking.endTime}`
    })

    return {
      success: true,
      data: bookings
    }
  } catch (err) {
    console.error('获取固定预约失败:', err)
    return {
      success: false,
      message: err.message || '获取失败'
    }
  }
}
