// 云函数：更新用户信息（昵称、头像）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { nickname, avatarUrl } = event

  console.log('=== 更新用户信息云函数开始 ===')
  console.log('用户OpenID:', wxContext.OPENID)
  console.log('更新内容:', { nickname, avatarUrl })

  try {
    // 查询用户是否存在
    const userRes = await db.collection('users')
      .where({
        _openid: wxContext.OPENID
      })
      .get()

    if (!userRes.data || userRes.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      }
    }

    const user = userRes.data[0]
    const updateData = {
      updateTime: db.serverDate()
    }

    // 更新昵称
    if (nickname && nickname.trim()) {
      updateData.nickname = nickname.trim()
    }

    // 更新头像
    if (avatarUrl) {
      updateData.avatarUrl = avatarUrl
      updateData.cloudAvatarUrl = avatarUrl // 保存原始云存储URL
    }

    console.log('准备更新数据:', updateData)

    // 执行更新
    await db.collection('users')
      .doc(user._id)
      .update({
        data: updateData
      })

    console.log('=== 更新成功 ===')

    // 返回更新后的用户信息
    const updatedUser = {
      ...user,
      ...updateData
    }

    return {
      success: true,
      data: updatedUser,
      message: '更新成功'
    }
  } catch (err) {
    console.error('=== 更新失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '更新失败：' + err.message
    }
  }
}
