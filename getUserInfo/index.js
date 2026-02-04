// 云函数：获取单个学员信息（带头像URL处理）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { openId } = event

  console.log('=== 获取学员信息云函数开始 ===')
  console.log('学员OpenID:', openId)

  try {
    if (!openId) {
      return {
        success: false,
        message: 'OpenID不能为空'
      }
    }

    // 查询学员信息
    const res = await db.collection('users')
      .where({
        _openid: openId
      })
      .get()

    if (!res.data || res.data.length === 0) {
      return {
        success: false,
        message: '学员不存在'
      }
    }

    const user = res.data[0]
    console.log('查询到学员:', user.nickname)

    // 保存原始云存储URL（如果还没有cloudAvatarUrl字段）
    const cloudUrl = user.cloudAvatarUrl || user.avatarUrl

    // 处理头像URL：将云存储URL转换为临时URL
    if (cloudUrl && cloudUrl.startsWith('cloud://')) {
      try {
        console.log('处理学员头像:', cloudUrl)
        const tempFileRes = await cloud.getTempFileURL({
          fileList: [cloudUrl]
        })

        if (tempFileRes.fileList && tempFileRes.fileList[0]) {
          const fileData = tempFileRes.fileList[0]
          if (fileData.status === 0 && fileData.tempFileURL) {
            console.log('✓ 成功转换头像URL:', fileData.tempFileURL)
            // 返回临时URL用于显示
            user.avatarUrl = fileData.tempFileURL
            // 同时返回原始云存储URL用于刷新
            user.cloudAvatarUrl = cloudUrl
          } else {
            console.warn('✗ 转换失败(status:', fileData.status, ')')
            user.avatarUrl = cloudUrl // 失败时使用原始URL
            user.cloudAvatarUrl = cloudUrl
          }
        }
      } catch (err) {
        console.error('获取临时URL失败:', err)
        user.avatarUrl = cloudUrl // 失败时使用原始URL
        user.cloudAvatarUrl = cloudUrl
      }
    } else if (!user.cloudAvatarUrl) {
      // 如果没有云存储URL，确保有cloudAvatarUrl字段（防止前端逻辑出错）
      user.cloudAvatarUrl = user.avatarUrl || ''
    }

    console.log('=== 获取学员信息成功 ===')

    return {
      success: true,
      data: user,
      message: '获取成功'
    }
  } catch (err) {
    console.error('=== 获取学员信息失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '获取失败：' + err.message
    }
  }
}
