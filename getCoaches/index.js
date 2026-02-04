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

    // 查询教练列表
    const res = await db.collection('coaches')
      .where(where)
      .orderBy('createTime', 'desc')
      .get()

    console.log('查询到', res.data.length, '个教练')

    // 处理头像URL：将云存储URL转换为临时URL（服务端处理）
    const coaches = await Promise.all(res.data.map(async (coach) => {
      // 保存原始云存储URL
      const cloudUrl = coach.cloudAvatarUrl || coach.avatarUrl

      if (cloudUrl && cloudUrl.startsWith('cloud://')) {
        try {
          console.log('处理教练头像:', coach.name, cloudUrl)
          const tempFileRes = await cloud.getTempFileURL({
            fileList: [cloudUrl]
          })

          if (tempFileRes.fileList && tempFileRes.fileList[0]) {
            const fileData = tempFileRes.fileList[0]
            if (fileData.status === 0 && fileData.tempFileURL) {
              console.log('✓ 成功转换:', coach.name, fileData.tempFileURL)
              // 返回临时URL用于显示
              coach.avatarUrl = fileData.tempFileURL
              // 同时返回原始云存储URL用于刷新
              coach.cloudAvatarUrl = cloudUrl
            } else {
              console.warn('✗ 转换失败(status:', fileData.status, '):', coach.name)
              // 失败时使用原始URL
              coach.avatarUrl = cloudUrl
              coach.cloudAvatarUrl = cloudUrl
            }
          }
        } catch (err) {
          console.error('获取临时URL失败:', coach.name, err)
          // 失败时使用原始URL
          coach.avatarUrl = cloudUrl
          coach.cloudAvatarUrl = cloudUrl
        }
      } else if (!coach.cloudAvatarUrl) {
        // 如果没有云存储URL，确保有cloudAvatarUrl字段
        coach.cloudAvatarUrl = coach.avatarUrl || ''
      }

      return coach
    }))

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
