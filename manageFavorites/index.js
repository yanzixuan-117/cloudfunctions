// 云函数：管理收藏（添加、取消、查询）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, videoId } = event

  console.log('=== 收藏管理云函数开始 ===')
  console.log('OPENID:', wxContext.OPENID)
  console.log('操作:', action)
  console.log('视频ID:', videoId)

  try {
    switch (action) {
      case 'add':
        return await addFavorite(wxContext.OPENID, videoId)

      case 'remove':
        return await removeFavorite(wxContext.OPENID, videoId)

      case 'check':
        return await checkFavorite(wxContext.OPENID, videoId)

      case 'getList':
        return await getFavoriteList(wxContext.OPENID)

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

// 添加收藏
async function addFavorite(openid, videoId) {
  // 检查视频是否存在
  const videoRes = await db.collection('videos').doc(videoId).get()
  if (!videoRes.data) {
    return {
      success: false,
      message: '视频不存在'
    }
  }

  // 检查是否已收藏
  const existRes = await db.collection('favorites').where({
    _openid: openid,
    videoId: videoId
  }).get()

  if (existRes.data.length > 0) {
    return {
      success: false,
      message: '已经收藏过了'
    }
  }

  // 添加收藏记录
  await db.collection('favorites').add({
    data: {
      _openid: openid,
      videoId: videoId,
      createTime: db.serverDate()
    }
  })

  return {
    success: true,
    message: '收藏成功'
  }
}

// 取消收藏
async function removeFavorite(openid, videoId) {
  // 删除收藏记录
  const res = await db.collection('favorites').where({
    _openid: openid,
    videoId: videoId
  }).remove()

  if (res.removed === 0) {
    return {
      success: false,
      message: '未找到收藏记录'
    }
  }

  return {
    success: true,
    message: '取消收藏成功'
  }
}

// 检查是否收藏
async function checkFavorite(openid, videoId) {
  const res = await db.collection('favorites').where({
    _openid: openid,
    videoId: videoId
  }).get()

  return {
    success: true,
    data: {
      isFavorited: res.data.length > 0
    }
  }
}

// 获取收藏列表
async function getFavoriteList(openid) {
  const res = await db.collection('favorites')
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
