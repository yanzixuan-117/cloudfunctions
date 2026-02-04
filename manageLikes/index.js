// 云函数：管理点赞（添加、取消、查询）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, videoId } = event

  console.log('=== 点赞管理云函数开始 ===')
  console.log('OPENID:', wxContext.OPENID)
  console.log('操作:', action)
  console.log('视频ID:', videoId)

  try {
    switch (action) {
      case 'add':
        return await addLike(wxContext.OPENID, videoId)

      case 'remove':
        return await removeLike(wxContext.OPENID, videoId)

      case 'check':
        return await checkLike(wxContext.OPENID, videoId)

      case 'getList':
        return await getLikeList(wxContext.OPENID)

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

// 添加点赞
async function addLike(openid, videoId) {
  // 检查视频是否存在
  const videoRes = await db.collection('videos').doc(videoId).get()
  if (!videoRes.data) {
    return {
      success: false,
      message: '视频不存在'
    }
  }

  // 检查是否已点赞
  const existRes = await db.collection('likes').where({
    _openid: openid,
    videoId: videoId
  }).get()

  if (existRes.data.length > 0) {
    return {
      success: false,
      message: '已经点赞过了'
    }
  }

  // 添加点赞记录
  await db.collection('likes').add({
    data: {
      _openid: openid,
      videoId: videoId,
      createTime: db.serverDate()
    }
  })

  // 增加视频点赞数
  await db.collection('videos').doc(videoId).update({
    data: {
      likeCount: db.command.inc(1)
    }
  })

  return {
    success: true,
    message: '点赞成功'
  }
}

// 取消点赞
async function removeLike(openid, videoId) {
  // 删除点赞记录
  const res = await db.collection('likes').where({
    _openid: openid,
    videoId: videoId
  }).remove()

  if (res.removed === 0) {
    return {
      success: false,
      message: '未找到点赞记录'
    }
  }

  // 减少视频点赞数
  await db.collection('videos').doc(videoId).update({
    data: {
      likeCount: db.command.inc(-1)
    }
  })

  return {
    success: true,
    message: '取消点赞成功'
  }
}

// 检查是否点赞
async function checkLike(openid, videoId) {
  const res = await db.collection('likes').where({
    _openid: openid,
    videoId: videoId
  }).get()

  return {
    success: true,
    data: {
      isLiked: res.data.length > 0
    }
  }
}

// 获取点赞列表
async function getLikeList(openid) {
  const res = await db.collection('likes')
    .where({
      _openid: openid
    })
    .orderBy('createTime', 'desc')
    .get()

  return {
    success: true,
    data: res.data
  }
}
