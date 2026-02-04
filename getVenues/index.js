// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  console.log('=== 获取球馆列表云函数开始 ===')

  try {
    const { date, startTime, endTime } = event

    // 获取所有正常状态的球馆
    const venuesRes = await db.collection('venues')
      .where({
        status: 1
      })
      .orderBy('createTime', 'asc')
      .get()

    console.log('找到球馆数量:', venuesRes.data.length)

    // 如果提供了日期和时间，需要检查球馆在该时段的可用性
    let availableVenues = venuesRes.data

    if (date && startTime) {
      // 检查每个球馆在该时段是否已被预约，以及是否在营业时间内
      for (const venue of availableVenues) {
        // 初始化状态
        venue.available = true
        venue.unavailableReason = '' // 不可用原因：'outside_hours' | 'already_booked'

        // 1. 检查营业时间
        let isWithinOperatingHours = true
        if (venue.operatingHours && venue.operatingHours.open && venue.operatingHours.close) {
          const bookingHour = parseInt(startTime.split(':')[0])
          const openHour = parseInt(venue.operatingHours.open.split(':')[0])
          const closeHour = parseInt(venue.operatingHours.close.split(':')[0])

          // 预约时段必须在营业时间内
          // 例如：营业时间 10:00-18:00，则只能预约 10:00-17:00 的时段
          // 因为 17:00-18:00 时段在 17 点开始，18 点结束
          isWithinOperatingHours = bookingHour >= openHour && bookingHour < closeHour

          if (!isWithinOperatingHours) {
            console.log(`球馆 ${venue.name} 营业时间 ${venue.operatingHours.open}-${venue.operatingHours.close}，预约时间 ${startTime} 不在营业时间内`)
            venue.available = false
            venue.unavailableReason = 'outside_hours'
          }
        }

        // 2. 检查是否已被预约（只有在营业时间内才需要检查）
        if (isWithinOperatingHours) {
          const conflictRes = await db.collection('bookings')
            .where({
              venue: venue.name,
              date: date,
              startTime: startTime,
              status: dbCmd.in(['pending', 'confirmed'])
            })
            .get()

          if (conflictRes.data.length > 0) {
            venue.available = false
            venue.unavailableReason = 'already_booked'
          }
        }

        // 添加营业时间信息用于前端显示
        if (venue.operatingHours && venue.operatingHours.open && venue.operatingHours.close) {
          venue.operatingHoursText = `${venue.operatingHours.open}-${venue.operatingHours.close}`
        }
      }

      console.log('时段可用性检查完成（包含营业时间检查）')
    } else {
      // 如果没有指定时间，所有球馆都标记为可用
      availableVenues = availableVenues.map(v => ({
        ...v,
        available: true
      }))
    }

    return {
      success: true,
      data: availableVenues
    }

  } catch (err) {
    console.error('=== 获取球馆列表失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '获取球馆列表失败：' + err.message
    }
  }
}

// 数据库操作命令
const dbCmd = db.command
