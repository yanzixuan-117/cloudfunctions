// 云函数：管理评论（添加、删除、查询）
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

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, videoId, commentId, content } = event

  console.log('=== 评论管理云函数开始 ===')
  console.log('OPENID:', wxContext.OPENID)
  console.log('操作:', action)

  try {
    switch (action) {
      case 'add':
        return await addComment(wxContext.OPENID, videoId, content)

      case 'delete':
        return await deleteComment(wxContext.OPENID, commentId)

      case 'getList':
        return await getCommentList(videoId)

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

// 添加评论
async function addComment(openid, videoId, content) {
  if (!content || content.trim() === '') {
    return {
      success: false,
      message: '评论内容不能为空'
    }
  }

  // 检查视频是否存在
  const videoRes = await db.collection('videos').doc(videoId).get()
  if (!videoRes.data) {
    return {
      success: false,
      message: '视频不存在'
    }
  }

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

  // 添加评论记录
  const res = await db.collection('comments').add({
    data: {
      _openid: openid,
      videoId: videoId,
      content: content.trim(),
      userName: user.nickname || '匿名用户',
      userAvatar: user.avatarUrl || '',
      createTime: db.serverDate()
    }
  })

  return {
    success: true,
    data: {
      _id: res._id
    },
    message: '评论成功'
  }
}

// 删除评论
async function deleteComment(openid, commentId) {
  // 查询评论信息
  const commentRes = await db.collection('comments').doc(commentId).get()
  if (!commentRes.data) {
    return {
      success: false,
      message: '评论不存在'
    }
  }

  const comment = commentRes.data

  // 权限检查：只有评论作者和管理员可以删除
  if (comment._openid !== openid && !ADMIN_OPENIDS.includes(openid)) {
    return {
      success: false,
      message: '无权限操作，仅作者和管理员可删除'
    }
  }

  // 删除评论记录
  await db.collection('comments').doc(commentId).remove()

  return {
    success: true,
    message: '删除成功'
  }
}

// 获取评论列表
async function getCommentList(videoId) {
  const res = await db.collection('comments')
    .where({
      videoId: videoId
    })
    .orderBy('createTime', 'desc')
    .get()

  return {
    success: true,
    data: res.data
  }
}
