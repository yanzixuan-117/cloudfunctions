// 云函数：管理视频（添加、编辑、删除、获取列表）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 引入统一的权限配置
const { isAdmin, isCoach } = require('../config/admin.config.js')

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, videoId, videoData } = event

  console.log('=== 视频管理云函数开始 ===')
  console.log('OPENID:', wxContext.OPENID)
  console.log('操作:', action)

  try {
    switch (action) {
      case 'list':
        return await getVideoList(event.filter)

      case 'get':
        return await getVideo(videoId)

      case 'add':
        // 权限检查：只有教练和管理员可以添加
        if (!await canAddVideo(wxContext.OPENID)) {
          return {
            success: false,
            message: '无权限操作，仅教练和管理员可添加视频'
          }
        }
        return await addVideo(wxContext.OPENID, videoData)

      case 'update':
        // 权限检查：只有视频作者和管理员可以编辑
        const video = await db.collection('videos').doc(videoId).get()
        if (!video.data) {
          return {
            success: false,
            message: '视频不存在'
          }
        }
        if (video.data._openid !== wxContext.OPENID && !isAdmin(wxContext.OPENID)) {
          return {
            success: false,
            message: '无权限操作，仅作者和管理员可编辑'
          }
        }
        return await updateVideo(videoId, videoData)

      case 'delete':
        // 权限检查：只有视频作者和管理员可以删除
        const delVideo = await db.collection('videos').doc(videoId).get()
        if (!delVideo.data) {
          return {
            success: false,
            message: '视频不存在'
          }
        }
        if (delVideo.data._openid !== wxContext.OPENID && !isAdmin(wxContext.OPENID)) {
          return {
            success: false,
            message: '无权限操作，仅作者和管理员可删除'
          }
        }
        return await deleteVideo(videoId, delVideo.data)

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

// 检查是否可以添加视频
async function canAddVideo(openid) {
  // 检查是否是管理员或教练
  if (isAdmin(openid)) {
    return true
  }

  // 检查是否是教练（通过配置文件）
  if (isCoach(openid)) {
    return true
  }

  return false
}

// 获取视频列表
async function getVideoList(filter = {}) {
  let query = db.collection('videos')

  // 筛选条件
  if (filter.status !== undefined) {
    query = query.where({
      status: filter.status
    })
  }

  if (filter.category) {
    query = query.where({
      category: filter.category
    })
  }

  const res = await query
    .orderBy('createTime', 'desc')
    .get()

  return {
    success: true,
    data: res.data,
    message: '获取成功'
  }
}

// 获取单个视频信息
async function getVideo(videoId) {
  const res = await db.collection('videos').doc(videoId).get()

  if (!res.data) {
    return {
      success: false,
      message: '视频信息不存在'
    }
  }

  const video = res.data

  // 处理缩略图URL
  if (video.thumbnail && video.thumbnail.startsWith('cloud://')) {
    try {
      const tempFileRes = await cloud.getTempFileURL({
        fileList: [video.thumbnail]
      })
      if (tempFileRes.fileList && tempFileRes.fileList[0] && tempFileRes.fileList[0].tempFileURL) {
        video.thumbnail = tempFileRes.fileList[0].tempFileURL
      }
    } catch (err) {
      console.error('获取缩略图临时URL失败:', video.title, err)
    }
  }

  // 增加观看次数
  await db.collection('videos').doc(videoId).update({
    data: {
      viewCount: (video.viewCount || 0) + 1
    }
  })

  return {
    success: true,
    data: video,
    message: '获取成功'
  }
}

// 添加视频
async function addVideo(openid, videoData) {
  // 获取用户信息
  const userRes = await db.collection('users').where({
    _openid: openid
  }).get()

  if (userRes.data.length === 0) {
    return {
      success: false,
      message: '用户不存在'
    }
  }

  const user = userRes.data[0]

  // 获取教练信息（如果是教练）
  let coachName = user.nickname
  if (user.role === 'coach') {
    const coachRes = await db.collection('coaches').where({
      _openid: openid
    }).get()
    if (coachRes.data.length > 0) {
      coachName = coachRes.data[0].name || user.nickname
    }
  }

  // 创建视频记录
  const data = {
    _openid: openid,
    authorName: coachName,
    authorAvatar: user.avatarUrl || '',
    title: videoData.title || '',
    description: videoData.description || '',
    category: videoData.category || '技术',
    difficulty: videoData.difficulty || '1',
    videoUrl: videoData.videoUrl || '',
    thumbnail: videoData.thumbnail || '',
    duration: videoData.duration || 0,
    tags: videoData.tags || [],
    viewCount: 0,
    likeCount: 0,
    status: videoData.status !== undefined ? videoData.status : 1,
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }

  const res = await db.collection('videos').add({ data })

  return {
    success: true,
    data: {
      _id: res._id,
      ...data
    },
    message: '添加成功'
  }
}

// 更新视频信息
async function updateVideo(videoId, videoData) {
  const data = {
    updateTime: db.serverDate()
  }

  // 允许更新的字段
  const allowedFields = [
    'title', 'description', 'category', 'difficulty',
    'videoUrl', 'thumbnail', 'duration', 'tags', 'status'
  ]

  allowedFields.forEach(field => {
    if (videoData[field] !== undefined) {
      data[field] = videoData[field]
    }
  })

  await db.collection('videos').doc(videoId).update({ data })

  return {
    success: true,
    message: '更新成功'
  }
}

// 删除视频
async function deleteVideo(videoId, video) {
  // 删除云存储中的视频文件
  if (video.videoUrl && video.videoUrl.startsWith('cloud://')) {
    try {
      const fileId = video.videoUrl.replace('cloud://', '')
      await cloud.deleteFile({
        fileList: [video.videoUrl]
      })
    } catch (err) {
      console.error('删除视频文件失败:', err)
    }
  }

  // 删除云存储中的缩略图
  if (video.thumbnail && video.thumbnail.startsWith('cloud://')) {
    try {
      await cloud.deleteFile({
        fileList: [video.thumbnail]
      })
    } catch (err) {
      console.error('删除缩略图失败:', err)
    }
  }

  // 删除视频记录
  await db.collection('videos').doc(videoId).remove()

  return {
    success: true,
    message: '删除成功'
  }
}
