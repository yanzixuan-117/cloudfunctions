// 云函数：固定预约管理
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 创建/更新/删除固定预约
 * 自动创建预约的云函数
 */
exports.main = async (event, context) => {
  const { action } = event
  const wxContext = cloud.getWXContext()

  console.log('=== 固定预约云函数 ===', action)

  try {
    switch (action) {
      case 'create':
        return await createFixedBooking(event, wxContext)
      case 'update':
        return await updateFixedBooking(event, wxContext)
      case 'updateStatus':
        return await updateBookingStatus(event, wxContext)
      case 'delete':
        return await deleteFixedBooking(event, wxContext)
      default:
        return {
          success: false,
          message: '未知的操作'
        }
    }
  } catch (err) {
    console.error('操作失败:', err)
    return {
      success: false,
      message: err.message || '操作失败'
    }
  }
}

// 创建固定预约
async function createFixedBooking(event, wxContext) {
  const { weekday, startTime, endTime, coachId, venueId, validUntil } = event
  const openid = wxContext.OPENID

  // 验证教练是否存在
  const coachRes = await db.collection('coaches').where({
    _id: coachId
  }).get()

  if (!coachRes.data || coachRes.data.length === 0) {
    return {
      success: false,
      message: '教练不存在'
    }
  }

  // 验证球馆是否存在
  if (venueId) {
    const venueRes = await db.collection('venues').where({
      _id: venueId
    }).get()

    if (!venueRes.data || venueRes.data.length === 0) {
      return {
        success: false,
        message: '球馆不存在'
      }
    }
  }

  // 检查是否已存在相同时间段的固定预约
  const existRes = await db.collection('fixedBookings').where({
    _openid: openid,
    weekday: weekday,
    startTime: startTime,
    endTime: endTime,
    status: 1
  }).get()

  if (existRes.data && existRes.data.length > 0) {
    return {
      success: false,
      message: '该时段已存在固定预约'
    }
  }

  // 创建固定预约
  const data = {
    _openid: openid,
    weekday,
    startTime,
    endTime,
    coachId,
    venueId: venueId || '',
    status: 1, // 1=启用，0=暂停
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }

  // 如果设置了有效期
  if (validUntil) {
    data.validUntil = validUntil
  }

  const result = await db.collection('fixedBookings').add({
    data
  })

  return {
    success: true,
    message: '设置成功',
    data: {
      id: result._id
    }
  }
}

// 更新固定预约
async function updateFixedBooking(event, wxContext) {
  const { bookingId, weekday, startTime, endTime, coachId, venueId, validUntil } = event
  const openid = wxContext.OPENID

  // 验证固定预约是否属于当前用户
  const bookingRes = await db.collection('fixedBookings').where({
    _id: bookingId,
    _openid: openid
  }).get()

  if (!bookingRes.data || bookingRes.data.length === 0) {
    return {
      success: false,
      message: '固定预约不存在'
    }
  }

  // 构建更新数据
  const updateData = {
    updateTime: db.serverDate()
  }

  if (weekday !== undefined) updateData.weekday = weekday
  if (startTime) updateData.startTime = startTime
  if (endTime) updateData.endTime = endTime
  if (coachId) updateData.coachId = coachId
  if (venueId !== undefined) updateData.venueId = venueId || ''
  if (validUntil !== undefined) {
    updateData.validUntil = validUntil || _.remove()
  }

  await db.collection('fixedBookings').doc(bookingId).update({
    data: updateData
  })

  return {
    success: true,
    message: '修改成功'
  }
}

// 更新状态
async function updateBookingStatus(event, wxContext) {
  const { bookingId, status } = event
  const openid = wxContext.OPENID

  const bookingRes = await db.collection('fixedBookings').where({
    _id: bookingId,
    _openid: openid
  }).get()

  if (!bookingRes.data || bookingRes.data.length === 0) {
    return {
      success: false,
      message: '固定预约不存在'
    }
  }

  await db.collection('fixedBookings').doc(bookingId).update({
    data: {
      status: status,
      updateTime: db.serverDate()
    }
  })

  return {
    success: true,
    message: status === 1 ? '已启用' : '已暂停'
  }
}

// 删除固定预约
async function deleteFixedBooking(event, wxContext) {
  const { bookingId } = event
  const openid = wxContext.OPENID

  const bookingRes = await db.collection('fixedBookings').where({
    _id: bookingId,
    _openid: openid
  }).get()

  if (!bookingRes.data || bookingRes.data.length === 0) {
    return {
      success: false,
      message: '固定预约不存在'
    }
  }

  await db.collection('fixedBookings').doc(bookingId).remove()

  return {
    success: true,
    message: '删除成功'
  }
}
