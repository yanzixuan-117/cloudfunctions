// 云函数：获取教练列表（带头像URL处理）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { status } = event

  console.log('=== 获取教练列表云函数开始 ===')
  console.log('参数:', event)

  try {
    // 构建查询条件
    const where = {}
    if (status !== undefined) {
      where.status = status
    }

    // 查询教练列表（按order字段排序）
    const res = await db.collection('coaches')
      .where(where)
      .orderBy('order', 'asc')
      .get()

    console.log('查询到', res.data.length, '个教练')

    // 处理头像URL：确保返回云存储URL
    const coaches = res.data.map(coach => {
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

      return coach
    })

    console.log('=== 获取教练列表成功 ===')

    return {
      success: true,
      data: coaches,
      message: '获取成功'
    }
  } catch (err) {
    console.error('=== 获取教练列表失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '获取失败：' + err.message
    }
  }
}
