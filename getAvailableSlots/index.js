// 云函数：获取可预约的时间段
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const dbCmd = db.command

/**
 * 根据球馆、教练、日期获取可预约的时间段
 */
exports.main = async (event, context) => {
  const { venueId, coachId, date } = event

  console.log('=== 获取可预约时间段 ===', { venueId, coachId, date })

  try {
    // 1. 获取球馆营业时间
    let openHour = 8   // 默认早上8点
    let closeHour = 22  // 默认晚上10点

    if (venueId) {
      const venueRes = await db.collection('venues').where({
        _id: venueId
      }).get()

      if (venueRes.data && venueRes.data.length > 0) {
        const venue = venueRes.data[0]
        if (venue.operatingHours) {
          openHour = parseInt(venue.operatingHours.open.split(':')[0])
          closeHour = parseInt(venue.operatingHours.close.split(':')[0])
        }
      }
    }

    console.log('营业时间:', openHour, '-', closeHour)

    // 2. 将日期转换为星期几
    const targetDate = new Date(date)
    const weekday = targetDate.getDay()

    console.log('星期:', weekday)

    // 3. 获取所有已有预约（包括手动预约和固定预约自动生成的）
    const bookedRes = await db.collection('bookings').where({
      date: date,
      status: dbCmd.in(['pending', 'confirmed'])
    }).get()

    const bookedSlots = new Set()
    bookedRes.data.forEach(booking => {
      // 根据球馆或教练过滤
      if (venueId && booking.venueId !== venueId) return
      if (coachId && booking.coachId !== coachId) return

      bookedSlots.add(booking.startTime)
    })

    console.log('已占用时间段:', Array.from(bookedSlots))

    // 4. 获取固定预约（自动创建的预约）
    const fixedBookingsRes = await db.collection('fixedBookings').where({
      weekday: weekday,
      status: 1
    }).get()

    const fixedBookedSlots = new Set()
    fixedBookingsRes.data.forEach(fb => {
      // 检查有效期
      if (fb.validUntil) {
        const validUntil = new Date(fb.validUntil)
        if (targetDate > validUntil) {
          return // 已过期
        }
      }

      // 检查是否有冲突：
      // 1. 如果用户选择了教练，且固定预约也指定了该教练 -> 冲突（不管球馆）
      // 2. 如果用户选择了球馆，且固定预约也指定了该球馆 -> 冲突（不管教练）
      // 这样可以确保固定预约的时间段被正确标记为不可用

      let hasConflict = false

      // 教练冲突检查
      if (coachId && fb.coachId === coachId) {
        hasConflict = true
      }

      // 球馆冲突检查
      if (venueId && fb.venueId === venueId) {
        hasConflict = true
      }

      if (hasConflict) {
        fixedBookedSlots.add(fb.startTime)
        console.log(`固定预约冲突: 教练${fb.coachId} 球馆${fb.venueId} 时间${fb.startTime}`)
      }
    })

    console.log('固定预约占用:', Array.from(fixedBookedSlots))

    // 5. 合并已占用的时间段
    const allBookedSlots = new Set([...bookedSlots, ...fixedBookedSlots])

    // 6. 生成可用时间段
    const slots = []
    for (let hour = openHour; hour < closeHour; hour++) {
      const timeStr = (hour < 10 ? '0' + hour : hour) + ':00'
      const endTimeStr = ((hour + 1) < 10 ? '0' + (hour + 1) : (hour + 1)) + ':00'
      const available = !allBookedSlots.has(timeStr)

      slots.push({
        time: timeStr,
        endTime: endTimeStr,
        available: available
      })
    }

    return {
      success: true,
      data: {
        slots: slots,
        total: slots.length,
        available: slots.filter(s => s.available).length
      }
    }
  } catch (err) {
    console.error('获取可预约时间段失败:', err)
    return {
      success: false,
      message: err.message || '获取失败',
      data: {
        slots: [],
        total: 0,
        available: 0
      }
    }
  }
}
