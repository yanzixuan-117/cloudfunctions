// 云函数：管理教练（添加、编辑、删除、获取列表）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 管理员账号配置
const ADMIN_OPENIDS = [
  'o1oNQ3RuLrFzMlsU7rle03cyM3Pw'  // 严 - 管理员
]

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, coachId, userId, coachData } = event

  try {
    switch (action) {
      case 'list':
        return await getCoachList()

      case 'get':
        return await getCoach(coachId)

      case 'getByOpenid':
        return await getCoachByOpenid(event.openid)

      case 'add':
        return await addCoach(userId, coachData)

      case 'update':
        return await updateCoach(coachId, coachData)

      case 'updateSchedule':
        return await updateSchedule(event.openid, event.schedule)

      case 'delete':
        return await deleteCoach(coachId)

      case 'users':
        return await getUserList()

      default:
        return {
          success: false,
          message: '无效的操作'
        }
    }
  } catch (err) {
    console.error('=== 操作失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '操作失败：' + err.message
    }
  }
}

// 获取教练列表（需要管理员权限）
async function getCoachList() {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  const res = await db.collection('coaches')
    .orderBy('createTime', 'desc')
    .get()

  // 处理头像URL：将云存储URL转换为临时URL
  const coaches = await Promise.all(res.data.map(async (coach) => {
    if (coach.avatarUrl && coach.avatarUrl.startsWith('cloud://')) {
      try {
        const tempFileRes = await cloud.getTempFileURL({
          fileList: [coach.avatarUrl]
        })
        if (tempFileRes.fileList && tempFileRes.fileList[0] && tempFileRes.fileList[0].tempFileURL) {
          coach.avatarUrl = tempFileRes.fileList[0].tempFileURL
        }
      } catch (err) {
        console.error('获取临时URL失败:', coach.name, err)
        // 保留原URL，前端会显示默认头像
      }
    }
    return coach
  }))

  return {
    success: true,
    data: coaches,
    message: '获取成功'
  }
}

// 获取单个教练信息
async function getCoach(coachId) {
  const res = await db.collection('coaches').doc(coachId).get()

  if (!res.data) {
    return {
      success: false,
      message: '教练信息不存在'
    }
  }

  const coach = res.data

  // 处理头像URL：将云存储URL转换为临时URL
  if (coach.avatarUrl && coach.avatarUrl.startsWith('cloud://')) {
    try {
      const tempFileRes = await cloud.getTempFileURL({
        fileList: [coach.avatarUrl]
      })
      if (tempFileRes.fileList && tempFileRes.fileList[0] && tempFileRes.fileList[0].tempFileURL) {
        coach.avatarUrl = tempFileRes.fileList[0].tempFileURL
      }
    } catch (err) {
      console.error('获取教练头像临时URL失败:', coach.name, err)
      // 保留原URL，前端会显示默认头像
    }
  }

  return {
    success: true,
    data: coach,
    message: '获取成功'
  }
}

// 添加教练（从用户表获取数据，需要管理员权限）
async function addCoach(userId, coachData) {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  // 先检查该用户是否已经是教练
  const existingCoach = await db.collection('coaches').where({
    _openid: userId
  }).get()

  if (existingCoach.data.length > 0) {
    return {
      success: false,
      message: '该用户已经是教练'
    }
  }

  // 从用户表获取用户信息
  const userRes = await db.collection('users').where({
    _openid: userId
  }).get()

  if (userRes.data.length === 0) {
    return {
      success: false,
      message: '用户不存在'
    }
  }

  const user = userRes.data[0]

  // 创建教练记录
  const data = {
    _openid: userId,
    name: coachData?.name || user.nickname || '',
    nickname: user.nickname || '',
    avatarUrl: coachData?.avatarUrl || user.avatarUrl || '',
    phone: coachData?.phone || user.phone || '',
    specialty: coachData?.specialty || [],
    introduction: coachData?.introduction || '暂无简介',
    experience: coachData?.experience || '暂无经验说明',
    certifications: coachData?.certifications || [],
    rating: 5.0,
    reviewCount: 0,
    availableSlots: coachData?.availableSlots || [],
    status: coachData?.status !== undefined ? coachData.status : 1,
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }

  const res = await db.collection('coaches').add({ data })

  // 更新用户角色为教练
  await db.collection('users').where({
    _openid: userId
  }).update({
    data: {
      role: 'coach',
      updateTime: db.serverDate()
    }
  })

  return {
    success: true,
    data: {
      _id: res._id,
      ...data
    },
    message: '添加成功'
  }
}

// 更新教练信息（需要管理员权限）
async function updateCoach(coachId, coachData) {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  const coachRes = await db.collection('coaches').doc(coachId).get()

  if (!coachRes.data) {
    return {
      success: false,
      message: '教练信息不存在'
    }
  }

  const data = {
    updateTime: db.serverDate()
  }

  // 允许更新的字段
  const allowedFields = [
    'name', 'avatarUrl', 'phone', 'specialty',
    'introduction', 'experience', 'certifications',
    'availableSlots', 'status', 'price'
  ]

  allowedFields.forEach(field => {
    if (coachData[field] !== undefined) {
      data[field] = coachData[field]
    }
  })

  await db.collection('coaches').doc(coachId).update({ data })

  return {
    success: true,
    message: '更新成功'
  }
}

// 删除教练（需要管理员权限）
async function deleteCoach(coachId) {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  const coachRes = await db.collection('coaches').doc(coachId).get()

  if (!coachRes.data) {
    return {
      success: false,
      message: '教练信息不存在'
    }
  }

  const coach = coachRes.data

  // 删除教练记录
  await db.collection('coaches').doc(coachId).remove()

  // 将用户角色改回学员
  await db.collection('users').where({
    _openid: coach._openid
  }).update({
    data: {
      role: 'student',
      updateTime: db.serverDate()
    }
  })

  return {
    success: true,
    message: '删除成功'
  }
}

// 获取用户列表（用于添加教练时选择，需要管理员权限）
async function getUserList() {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  const res = await db.collection('users')
    .orderBy('createTime', 'desc')
    .field({
      _openid: true,
      nickname: true,
      avatarUrl: true,
      phone: true,
      role: true,
      createTime: true
    })
    .get()

  // 处理头像URL：将云存储URL转换为临时URL
  const users = await Promise.all(res.data.map(async (user) => {
    if (user.avatarUrl && user.avatarUrl.startsWith('cloud://')) {
      try {
        const tempFileRes = await cloud.getTempFileURL({
          fileList: [user.avatarUrl]
        })
        if (tempFileRes.fileList && tempFileRes.fileList[0] && tempFileRes.fileList[0].tempFileURL) {
          user.avatarUrl = tempFileRes.fileList[0].tempFileURL
        }
      } catch (err) {
        console.error('获取用户临时URL失败:', user.nickname, err)
        // 保留原URL，前端会显示默认头像
      }
    }
    return user
  }))

  return {
    success: true,
    data: users,
    message: '获取成功'
  }
}

// 根据 openid 获取教练信息（用于教练自己查看/修改信息）
async function getCoachByOpenid(openid) {
  const res = await db.collection('coaches').where({
    _openid: openid
  }).get()

  if (res.data.length === 0) {
    return {
      success: false,
      message: '教练信息不存在'
    }
  }

  const coach = res.data[0]

  // 处理头像URL：将云存储URL转换为临时URL
  if (coach.avatarUrl && coach.avatarUrl.startsWith('cloud://')) {
    try {
      const tempFileRes = await cloud.getTempFileURL({
        fileList: [coach.avatarUrl]
      })
      if (tempFileRes.fileList && tempFileRes.fileList[0] && tempFileRes.fileList[0].tempFileURL) {
        coach.avatarUrl = tempFileRes.fileList[0].tempFileURL
      }
    } catch (err) {
      console.error('获取教练头像临时URL失败:', coach.name, err)
    }
  }

  return {
    success: true,
    data: coach,
    message: '获取成功'
  }
}

// 更新教练时间设置
async function updateSchedule(openid, schedule) {
  // 验证参数
  if (!openid) {
    return {
      success: false,
      message: '缺少教练ID'
    }
  }

  if (!schedule || !schedule.weeklySlots) {
    return {
      success: false,
      message: '缺少时间设置数据'
    }
  }

  // 检查教练是否存在
  const coachRes = await db.collection('coaches').where({
    _openid: openid
  }).get()

  if (coachRes.data.length === 0) {
    return {
      success: false,
      message: '教练信息不存在'
    }
  }

  // 更新时间设置
  await db.collection('coaches').where({
    _openid: openid
  }).update({
    data: {
      schedule: schedule,
      updateTime: db.serverDate()
    }
  })

  console.log('教练时间设置更新成功:', openid)

  return {
    success: true,
    message: '保存成功'
  }
}
