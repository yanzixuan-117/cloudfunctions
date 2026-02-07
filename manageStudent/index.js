// 云函数：学员管理（添加为学员、课程管理、课时管理）
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
  const { action, userId, studentData, courseData } = event

  try {
    switch (action) {
      case 'list':
        return await getStudentList(event.roleFilter)

      case 'addAsStudent':
        return await addAsStudent(userId)

      case 'addCourse':
        return await addCourse(userId, courseData)

      case 'getStudentCourses':
        return await getStudentCourses(userId)

      case 'getCourseDetail':
        return await getCourseDetail(courseData.courseId)

      case 'updateCourse':
        return await updateCourse(courseData.courseId, courseData)

      case 'deleteCourse':
        return await deleteCourse(courseData.courseId)

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

// 获取学员/游客列表（需要管理员权限）
async function getStudentList(roleFilter) {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  let query = db.collection('users')

  // 角色筛选
  if (roleFilter && roleFilter !== 'all') {
    query = query.where({
      role: roleFilter
    })
  }

  const res = await query
    .orderBy('createTime', 'desc')
    .get()

  // 批量处理头像URL
  const userList = res.data || []
  const cloudUrls = []
  const urlIndexMap = {} // 记录云存储URL在列表中的索引

  // 收集所有需要转换的云存储URL
  userList.forEach((user, index) => {
    // 确保 cloudAvatarUrl 字段存在
    if (!user.cloudAvatarUrl) {
      user.cloudAvatarUrl = user.avatarUrl || ''
    }

    // 如果 avatarUrl 为空但有 cloudAvatarUrl，需要转换
    if ((!user.avatarUrl || !user.avatarUrl.trim()) && user.cloudAvatarUrl && user.cloudAvatarUrl.startsWith('cloud://')) {
      cloudUrls.push(user.cloudAvatarUrl)
      urlIndexMap[user.cloudAvatarUrl] = index
    }
    // 如果 avatarUrl 本身就是 cloud:// 格式，也需要转换
    else if (user.avatarUrl && user.avatarUrl.startsWith('cloud://')) {
      cloudUrls.push(user.avatarUrl)
      urlIndexMap[user.avatarUrl] = index
    }
  })

  // 批量转换云存储URL
  if (cloudUrls.length > 0) {
    try {
      console.log(`开始转换 ${cloudUrls.length} 个头像URL`)
      const tempFileRes = await cloud.getTempFileURL({
        fileList: cloudUrls
      })

      if (tempFileRes.fileList) {
        tempFileRes.fileList.forEach((fileData) => {
          const index = urlIndexMap[fileData.fileID]
          if (index !== undefined && fileData.status === 0 && fileData.tempFileURL) {
            userList[index].avatarUrl = fileData.tempFileURL
            console.log(`✓ 索引 ${index} 头像转换成功`)
          } else {
            console.warn(`✗ 索引 ${index} 头像转换失败, status: ${fileData.status}`)
            userList[index].avatarUrl = ''
          }
        })
      }
    } catch (err) {
      console.error('批量转换头像URL失败:', err)
      // 转换失败时，将所有云存储URL设置为空
      cloudUrls.forEach(url => {
        const index = urlIndexMap[url]
        if (index !== undefined) {
          userList[index].avatarUrl = ''
        }
      })
    }
  }

  return {
    success: true,
    data: userList,
    message: '获取成功'
  }
}

// 将游客添加为学员（需要管理员权限）
async function addAsStudent(userId) {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  if (!userId) {
    return {
      success: false,
      message: '缺少用户ID'
    }
  }

  // 查询用户信息
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

  // 检查用户是否已经是学员
  if (user.role === 'student') {
    return {
      success: false,
      message: '该用户已经是学员'
    }
  }

  // 更新用户角色为学员
  await db.collection('users').where({
    _openid: userId
  }).update({
    data: {
      role: 'student',
      currentRole: 'student', // 同时更新显示角色
      updateTime: db.serverDate()
    }
  })

  return {
    success: true,
    message: '添加成功'
  }
}

// 为学员添加课程（需要管理员权限）
async function addCourse(userId, courseData) {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  if (!userId) {
    return {
      success: false,
      message: '缺少用户ID'
    }
  }

  if (!courseData) {
    return {
      success: false,
      message: '缺少课程数据'
    }
  }

  // 验证必填字段
  if (!courseData.totalSessions || !courseData.endDate) {
    return {
      success: false,
      message: '缺少必填字段：课次总数或结束日期'
    }
  }

  // 查询用户信息
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

  // 检查用户是否是学员
  if (user.role !== 'student') {
    return {
      success: false,
      message: '该用户不是学员，无法添加课程'
    }
  }

  // 创建课程记录
  const data = {
    studentOpenid: userId,
    studentName: user.nickname,
    studentAvatar: user.avatarUrl,
    courseName: courseData.courseName || '网球课程',
    totalSessions: parseInt(courseData.totalSessions), // 总课次
    remainingSessions: parseInt(courseData.totalSessions), // 剩余课次
    usedSessions: 0, // 已使用课次
    endDate: courseData.endDate, // 结束日期
    coachId: courseData.coachId || '', // 指定教练（可选）
    coachName: courseData.coachName || '',
    notes: courseData.notes || '', // 备注
    status: 'active', // active: 有效, expired: 已过期, completed: 已完成
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }

  const res = await db.collection('studentCourses').add({ data })

  return {
    success: true,
    data: {
      _id: res._id,
      ...data
    },
    message: '添加成功'
  }
}

// 获取学员的课程列表（需要管理员权限）
async function getStudentCourses(userId) {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  if (!userId) {
    return {
      success: false,
      message: '缺少用户ID'
    }
  }

  const res = await db.collection('studentCourses')
    .where({
      studentOpenid: userId
    })
    .orderBy('createTime', 'desc')
    .get()

  return {
    success: true,
    data: res.data,
    message: '获取成功'
  }
}

// 获取课程详情（需要管理员权限）
async function getCourseDetail(courseId) {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  if (!courseId) {
    return {
      success: false,
      message: '缺少课程ID'
    }
  }

  const res = await db.collection('studentCourses').doc(courseId).get()

  if (!res.data) {
    return {
      success: false,
      message: '课程不存在'
    }
  }

  return {
    success: true,
    data: res.data,
    message: '获取成功'
  }
}

// 更新课程信息（需要管理员权限）
async function updateCourse(courseId, courseData) {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  if (!courseId) {
    return {
      success: false,
      message: '缺少课程ID'
    }
  }

  const courseRes = await db.collection('studentCourses').doc(courseId).get()

  if (!courseRes.data) {
    return {
      success: false,
      message: '课程不存在'
    }
  }

  const data = {
    updateTime: db.serverDate()
  }

  // 允许更新的字段
  const allowedFields = [
    'courseName', 'totalSessions', 'remainingSessions',
    'usedSessions', 'endDate', 'coachId', 'coachName', 'notes', 'status'
  ]

  allowedFields.forEach(field => {
    if (courseData[field] !== undefined) {
      data[field] = courseData[field]
    }
  })

  await db.collection('studentCourses').doc(courseId).update({ data })

  return {
    success: true,
    message: '更新成功'
  }
}

// 删除课程（需要管理员权限）
async function deleteCourse(courseId) {
  // 权限检查
  const wxContext = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    return {
      success: false,
      message: '无权限操作，仅管理员可访问'
    }
  }

  if (!courseId) {
    return {
      success: false,
      message: '缺少课程ID'
    }
  }

  const courseRes = await db.collection('studentCourses').doc(courseId).get()

  if (!courseRes.data) {
    return {
      success: false,
      message: '课程不存在'
    }
  }

  await db.collection('studentCourses').doc(courseId).remove()

  return {
    success: true,
    message: '删除成功'
  }
}
