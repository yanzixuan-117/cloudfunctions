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

  // 批量处理头像URL
  const coachList = res.data || []
  const cloudUrls = []
  const urlIndexMap = {} // 记录云存储URL在列表中的索引

  // 收集所有需要转换的云存储URL
  coachList.forEach((coach, index) => {
    // 确保 cloudAvatarUrl 字段存在
    if (!coach.cloudAvatarUrl) {
      coach.cloudAvatarUrl = coach.avatarUrl || ''
    }

    // 如果 avatarUrl 为空但有 cloudAvatarUrl，需要转换
    if ((!coach.avatarUrl || !coach.avatarUrl.trim()) && coach.cloudAvatarUrl && coach.cloudAvatarUrl.startsWith('cloud://')) {
      cloudUrls.push(coach.cloudAvatarUrl)
      urlIndexMap[coach.cloudAvatarUrl] = index
    }
    // 如果 avatarUrl 本身就是 cloud:// 格式，也需要转换
    else if (coach.avatarUrl && coach.avatarUrl.startsWith('cloud://')) {
      cloudUrls.push(coach.avatarUrl)
      urlIndexMap[coach.avatarUrl] = index
    }
  })

  // 批量转换云存储URL
  if (cloudUrls.length > 0) {
    try {
      console.log(`开始转换 ${cloudUrls.length} 个教练头像URL`)
      const tempFileRes = await cloud.getTempFileURL({
        fileList: cloudUrls
      })

      if (tempFileRes.fileList) {
        tempFileRes.fileList.forEach((fileData) => {
          const index = urlIndexMap[fileData.fileID]
          if (index !== undefined && fileData.status === 0 && fileData.tempFileURL) {
            coachList[index].avatarUrl = fileData.tempFileURL
            console.log(`✓ 索引 ${index} 教练头像转换成功`)
          } else {
            console.warn(`✗ 索引 ${index} 教练头像转换失败, status: ${fileData.status}`)
            coachList[index].avatarUrl = ''
          }
        })
      }
    } catch (err) {
      console.error('批量转换教练头像URL失败:', err)
      // 转换失败时，将所有云存储URL设置为空
      cloudUrls.forEach(url => {
        const index = urlIndexMap[url]
        if (index !== undefined) {
          coachList[index].avatarUrl = ''
        }
      })
    }
  }

  return {
    success: true,
    data: coachList,
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

  // 处理头像URL：确保返回云存储URL
  const avatarUrl = coach.avatarUrl || ''
  const cloudAvatarUrl = coach.cloudAvatarUrl || ''

  // 判断是否为云存储URL或临时URL
  const isCloudUrl = avatarUrl && avatarUrl.startsWith('cloud://')
  const isTempUrl = avatarUrl && avatarUrl.startsWith('https://') && avatarUrl.includes('sign=')
  const isCloudAvatarUrl = cloudAvatarUrl && cloudAvatarUrl.startsWith('cloud://')
  const isCloudAvatarTempUrl = cloudAvatarUrl && cloudAvatarUrl.startsWith('https://') && cloudAvatarUrl.includes('sign=')

  // 逻辑：优先使用云存储URL（cloud://开头），避免临时URL
  if (isCloudUrl) {
    // avatarUrl是云存储URL，确保cloudAvatarUrl也是云存储URL
    coach.cloudAvatarUrl = avatarUrl
    coach.avatarUrl = avatarUrl
  } else if (isCloudAvatarUrl) {
    // cloudAvatarUrl是云存储URL，使用它
    coach.avatarUrl = cloudAvatarUrl
  } else if (isTempUrl || isCloudAvatarTempUrl) {
    // 如果是临时URL，清空并使用默认头像
    console.warn('教练头像URL是临时URL，需要重新上传:', coach.name)
    coach.cloudAvatarUrl = ''
    coach.avatarUrl = ''
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

  // 获取当前教练数量，用于设置排序
  const coachesCountRes = await db.collection('coaches').count()
  const currentOrder = coachesCountRes.total || 0

  // 创建教练记录
  const data = {
    _openid: userId,
    name: coachData?.name || user.nickname || '',
    nickname: user.nickname || '',
    avatarUrl: coachData?.avatarUrl || user.avatarUrl || '',
    cloudAvatarUrl: coachData?.avatarUrl || user.avatarUrl || '',  // 保存原始云存储URL
    phone: coachData?.phone || user.phone || '',
    specialty: coachData?.specialty || [],
    introduction: coachData?.introduction || '暂无简介',
    experience: coachData?.experience || '暂无经验说明',
    certifications: coachData?.certifications || [],
    rating: 5.0,
    reviewCount: 0,
    availableSlots: coachData?.availableSlots || [],
    status: coachData?.status !== undefined ? coachData.status : 1,
    order: currentOrder,  // 设置排序值
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
    'name', 'avatarUrl', 'cloudAvatarUrl', 'phone', 'specialty',
    'introduction', 'experience', 'certifications',
    'availableSlots', 'status', 'price', 'order'
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

  // 获取所有教练的openid列表
  const coachesRes = await db.collection('coaches')
    .field({
      _openid: true
    })
    .get()

  const coachOpenids = new Set(coachesRes.data.map(c => c._openid))

  // 处理用户数据：检查角色并返回
  const users = res.data.map(user => {
    // 检查用户是否真的是教练（在coaches表中有记录）
    // 如果users表显示role为coach，但coaches表中没有记录，则修正为student
    const isActuallyCoach = coachOpenids.has(user._openid)
    const effectiveRole = isActuallyCoach ? 'coach' : 'student'

    // 返回用户数据，使用修正后的角色
    return {
      ...user,
      role: effectiveRole
    }
  })

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

  // 处理头像URL：确保返回云存储URL
  const avatarUrl = coach.avatarUrl || ''
  const cloudAvatarUrl = coach.cloudAvatarUrl || ''

  // 判断是否为云存储URL或临时URL
  const isCloudUrl = avatarUrl && avatarUrl.startsWith('cloud://')
  const isTempUrl = avatarUrl && avatarUrl.startsWith('https://') && avatarUrl.includes('sign=')
  const isCloudAvatarUrl = cloudAvatarUrl && cloudAvatarUrl.startsWith('cloud://')
  const isCloudAvatarTempUrl = cloudAvatarUrl && cloudAvatarUrl.startsWith('https://') && cloudAvatarUrl.includes('sign=')

  // 逻辑：优先使用云存储URL（cloud://开头），避免临时URL
  if (isCloudUrl) {
    // avatarUrl是云存储URL，确保cloudAvatarUrl也是云存储URL
    coach.cloudAvatarUrl = avatarUrl
    coach.avatarUrl = avatarUrl
  } else if (isCloudAvatarUrl) {
    // cloudAvatarUrl是云存储URL，使用它
    coach.avatarUrl = cloudAvatarUrl
  } else if (isTempUrl || isCloudAvatarTempUrl) {
    // 如果是临时URL，清空并使用默认头像
    console.warn('教练头像URL是临时URL，需要重新上传:', coach.name)
    coach.cloudAvatarUrl = ''
    coach.avatarUrl = ''
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
