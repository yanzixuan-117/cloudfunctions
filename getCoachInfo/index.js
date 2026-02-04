// 云函数：获取单个教练信息（带头像URL处理）
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { coachId } = event

  console.log('=== 获取教练信息云函数开始 ===')
  console.log('教练ID:', coachId)

  try {
    if (!coachId) {
      return {
        success: false,
        message: '教练ID不能为空'
      }
    }

    // 查询教练信息
    const res = await db.collection('coaches')
      .doc(coachId)
      .get()

    if (!res.data) {
      return {
        success: false,
        message: '教练不存在'
      }
    }

    const coach = res.data
    console.log('查询到教练:', coach.name)

    // 保存原始云存储URL（如果还没有cloudAvatarUrl字段）
    const cloudUrl = coach.cloudAvatarUrl || coach.avatarUrl

    // 处理头像URL：将云存储URL转换为临时URL
    if (cloudUrl && cloudUrl.startsWith('cloud://')) {
      try {
        console.log('处理教练头像:', cloudUrl)
        const tempFileRes = await cloud.getTempFileURL({
          fileList: [cloudUrl]
        })

        if (tempFileRes.fileList && tempFileRes.fileList[0]) {
          const fileData = tempFileRes.fileList[0]
          if (fileData.status === 0 && fileData.tempFileURL) {
            console.log('✓ 成功转换头像URL:', fileData.tempFileURL)
            // 返回临时URL用于显示
            coach.avatarUrl = fileData.tempFileURL
            // 同时返回原始云存储URL用于刷新
            coach.cloudAvatarUrl = cloudUrl
          } else {
            console.warn('✗ 转换失败(status:', fileData.status, ')')
            coach.avatarUrl = cloudUrl // 失败时使用原始URL
            coach.cloudAvatarUrl = cloudUrl
          }
        }
      } catch (err) {
        console.error('获取临时URL失败:', err)
        coach.avatarUrl = cloudUrl // 失败时使用原始URL
        coach.cloudAvatarUrl = cloudUrl
      }
    } else if (!coach.cloudAvatarUrl) {
      // 如果没有云存储URL，确保有cloudAvatarUrl字段（防止前端逻辑出错）
      coach.cloudAvatarUrl = coach.avatarUrl || ''
    }

    console.log('=== 获取教练信息成功 ===')

    return {
      success: true,
      data: coach,
      message: '获取成功'
    }
  } catch (err) {
    console.error('=== 获取教练信息失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '获取失败：' + err.message
    }
  }
}
