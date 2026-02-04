// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, venueId, venueData } = event

  console.log('=== 球馆管理云函数开始 ===')
  console.log('操作类型:', action)
  console.log('OPENID:', wxContext.OPENID)

  try {
    // 验证用户权限
    const userRes = await db.collection('users').where({
      _openid: wxContext.OPENID
    }).get()

    if (userRes.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      }
    }

    const user = userRes.data[0]

    // 只有管理员可以操作
    if (user.role !== 'admin') {
      return {
        success: false,
        message: '权限不足，仅限管理员操作'
      }
    }

    // 根据操作类型执行不同逻辑
    switch (action) {
      case 'add':
        return await addVenue(venueData)

      case 'update':
        return await updateVenue(venueId, venueData)

      case 'delete':
        return await deleteVenue(venueId)

      case 'list':
        return await getVenueList()

      case 'get':
        return await getVenue(venueId)

      default:
        return {
          success: false,
          message: '无效的操作类型'
        }
    }

  } catch (err) {
    console.error('=== 球馆管理失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '操作失败：' + err.message
    }
  }
}

// 添加球馆
async function addVenue(venueData) {
  console.log('=== 添加球馆开始 ===')
  console.log('接收到的 venueData:', JSON.stringify(venueData, null, 2))
  console.log('imageList:', venueData.imageList)
  console.log('imageList 类型:', typeof venueData.imageList)
  console.log('imageList 是否为数组:', Array.isArray(venueData.imageList))
  console.log('imageList 长度:', venueData.imageList ? venueData.imageList.length : 'undefined')

  // 检查球馆名称是否已存在
  const existingVenue = await db.collection('venues')
    .where({
      name: venueData.name
    })
    .get()

  if (existingVenue.data.length > 0) {
    return {
      success: false,
      message: '球馆名称已存在'
    }
  }

  // 创建球馆记录
  const data = {
    name: venueData.name,
    address: venueData.address || '',
    description: venueData.description || '',
    imageList: venueData.imageList || [],
    operatingHours: {
      open: venueData.openTime || '09:00',
      close: venueData.closeTime || '18:00'
    },
    status: 1,
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }

  console.log('准备保存到数据库的数据:', JSON.stringify(data, null, 2))

  const res = await db.collection('venues').add({
    data: data
  })

  console.log('球馆添加成功，ID:', res._id)
  console.log('=== 添加球馆完成 ===')

  return {
    success: true,
    message: '球馆添加成功',
    data: {
      venueId: res._id
    }
  }
}

// 更新球馆
async function updateVenue(venueId, venueData) {
  console.log('更新球馆:', venueId, venueData)

  if (!venueId) {
    return {
      success: false,
      message: '球馆ID不能为空'
    }
  }

  // 检查球馆是否存在
  const venueRes = await db.collection('venues').doc(venueId).get()

  if (!venueRes.data) {
    return {
      success: false,
      message: '球馆不存在'
    }
  }

  // 如果修改了名称，检查新名称是否与其他球馆冲突
  if (venueData.name && venueData.name !== venueRes.data.name) {
    const existingVenue = await db.collection('venues')
      .where({
        name: venueData.name
      })
      .get()

    if (existingVenue.data.length > 0) {
      return {
        success: false,
        message: '球馆名称已存在'
      }
    }
  }

  // 准备更新数据
  const updateData = {
    updateTime: db.serverDate()
  }

  if (venueData.name !== undefined) updateData.name = venueData.name
  if (venueData.address !== undefined) updateData.address = venueData.address
  if (venueData.description !== undefined) updateData.description = venueData.description
  if (venueData.imageList !== undefined) updateData.imageList = venueData.imageList
  if (venueData.openTime !== undefined || venueData.closeTime !== undefined) {
    updateData.operatingHours = {
      open: venueData.openTime || venueRes.data.operatingHours.open,
      close: venueData.closeTime || venueRes.data.operatingHours.close
    }
  }
  if (venueData.status !== undefined) updateData.status = venueData.status

  // 更新球馆
  await db.collection('venues').doc(venueId).update({
    data: updateData
  })

  console.log('球馆更新成功')

  return {
    success: true,
    message: '球馆更新成功'
  }
}

// 删除球馆
async function deleteVenue(venueId) {
  console.log('删除球馆:', venueId)

  if (!venueId) {
    return {
      success: false,
      message: '球馆ID不能为空'
    }
  }

  // 检查是否有预约记录使用该球馆
  const bookingRes = await db.collection('bookings')
    .where({
      venue: db.command.neq(''),
      status: dbCmd.in(['pending', 'confirmed'])
    })
    .get()

  // 检查是否有使用该球馆的预约
  // 需要先获取球馆名称
  const venueRes = await db.collection('venues').doc(venueId).get()
  if (!venueRes.data) {
    return {
      success: false,
      message: '球馆不存在'
    }
  }

  const venueName = venueRes.data.name
  const hasBookings = bookingRes.data.some(booking => booking.venue === venueName)

  if (hasBookings) {
    return {
      success: false,
      message: '该球馆有未完成的预约，无法删除'
    }
  }

  // 删除球馆
  await db.collection('venues').doc(venueId).remove()

  console.log('球馆删除成功')

  return {
    success: true,
    message: '球馆删除成功'
  }
}

// 获取球馆列表
async function getVenueList() {
  console.log('获取球馆列表')

  const res = await db.collection('venues')
    .orderBy('createTime', 'desc')
    .get()

  console.log('找到球馆数量:', res.data.length)

  return {
    success: true,
    data: res.data
  }
}

// 获取单个球馆
async function getVenue(venueId) {
  console.log('获取球馆详情:', venueId)

  if (!venueId) {
    return {
      success: false,
      message: '球馆ID不能为空'
    }
  }

  const res = await db.collection('venues').doc(venueId).get()

  if (!res.data) {
    return {
      success: false,
      message: '球馆不存在'
    }
  }

  console.log('球馆详情获取成功')

  return {
    success: true,
    data: res.data
  }
}

// 数据库操作命令
const dbCmd = db.command
