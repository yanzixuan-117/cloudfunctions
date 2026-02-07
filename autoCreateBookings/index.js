// 云函数：自动创建固定预约的课程
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const dbCmd = db.command

/**
 * 根据固定预约自动创建课程
 * 可以通过定时触发器每天调用，也可以手动调用
 */
exports.main = async (event, context) => {
  const { targetDate } = event
  const wxContext = cloud.getWXContext()

  console.log('=== 自动创建固定预约课程 ===', targetDate)

  try {
    // 确定目标日期
    let target = targetDate ? new Date(targetDate) : new Date()

    // 格式化日期为 YYYY-MM-DD
    const year = target.getFullYear()
    const month = String(target.getMonth() + 1).padStart(2, '0')
    const day = String(target.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    // 获取目标日期是星期几 (0-6, 0=周日)
    const weekday = target.getDay()

    console.log('目标日期:', dateStr, '星期' + weekday)

    // 获取所有启用的固定预约
    const fixedBookingsRes = await db.collection('fixedBookings').where({
      status: 1
    }).get()

    const fixedBookings = fixedBookingsRes.data || []
    console.log('找到固定预约数量:', fixedBookings.length)

    if (fixedBookings.length === 0) {
      return {
        success: true,
        message: '没有启用的固定预约',
        created: 0,
        skipped: 0
      }
    }

    // 获取所有球馆信息（用于获取球馆名称）
    const venuesRes = await db.collection('venues').get()
    const venues = venuesRes.data || []
    const venueMap = {}
    venues.forEach(v => {
      venueMap[v._id] = v
    })

    let createdCount = 0
    let skippedCount = 0
    const results = []

    // 遍历所有固定预约
    for (const booking of fixedBookings) {
      // 检查星期几是否匹配
      if (booking.weekday !== weekday) {
        continue
      }

      // 检查有效期是否已过
      if (booking.validUntil) {
        const validUntil = new Date(booking.validUntil)
        if (target > validUntil) {
          console.log(`固定预约 ${booking._id} 已过期`)
          skippedCount++
          continue
        }
      }

      // 检查当天该时段该教练是否已有预约
      const coachConflictRes = await db.collection('bookings').where({
        coachId: booking.coachId,
        date: dateStr,
        startTime: booking.startTime,
        status: dbCmd.in(['pending', 'confirmed'])
      }).get()

      if (coachConflictRes.data && coachConflictRes.data.length > 0) {
        console.log(`教练时段已被占用: ${dateStr} ${booking.startTime}`)
        skippedCount++
        results.push({
          bookingId: booking._id,
          status: 'skipped',
          reason: 'coach_conflict'
        })
        continue
      }

      // 检查当天该时段该球馆是否已有预约
      if (booking.venueId) {
        const venueConflictRes = await db.collection('bookings').where({
          venueId: booking.venueId,
          date: dateStr,
          startTime: booking.startTime,
          status: dbCmd.in(['pending', 'confirmed'])
        }).get()

        if (venueConflictRes.data && venueConflictRes.data.length > 0) {
          console.log(`球馆时段已被占用: ${dateStr} ${booking.startTime}`)
          skippedCount++
          results.push({
            bookingId: booking._id,
            status: 'skipped',
            reason: 'venue_conflict'
          })
          continue
        }
      }

      // 获取球馆名称
      const venueInfo = venueMap[booking.venueId]
      const venueName = venueInfo ? venueInfo.name : ''

      // 创建预约
      const bookingData = {
        studentId: booking._openid,
        coachId: booking.coachId,
        date: dateStr,
        startTime: booking.startTime,
        endTime: booking.endTime,
        venue: venueName,
        venueId: booking.venueId || '',
        status: 'confirmed', // 固定预约默认为已确认状态，无需教练审核
        source: 'fixed', // 标记为固定预约自动创建
        fixedBookingId: booking._id, // 关联的固定预约ID
        students: booking.students || [], // 上课人列表
        createTime: db.serverDate()
      }

      const result = await db.collection('bookings').add({
        data: bookingData
      })

      console.log(`创建预约成功: ${dateStr} ${booking.startTime}-${booking.endTime}`)
      createdCount++
      results.push({
        bookingId: booking._id,
        newBookingId: result._id,
        status: 'created'
      })
    }

    return {
      success: true,
      message: `成功创建 ${createdCount} 个预约`,
      created: createdCount,
      skipped: skippedCount,
      results: results
    }
  } catch (err) {
    console.error('自动创建预约失败:', err)
    return {
      success: false,
      message: err.message || '创建失败',
      created: 0,
      skipped: 0
    }
  }
}
