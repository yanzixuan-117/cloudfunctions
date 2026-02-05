// 云函数：更新教练订阅消息状态
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  try {
    // 查找当前用户的教练记录
    const coachRes = await db.collection('coaches').where({
      _openid: wxContext.OPENID
    }).get()

    if (coachRes.data.length === 0) {
      return {
        success: false,
        message: '未找到教练记录'
      }
    }

    // 更新教练订阅状态
    await db.collection('coaches').doc(coachRes.data[0]._id).update({
      data: {
        needReSubscribe: event.needReSubscribe || false,
        lastSubscribeUpdate: new Date()
      }
    })

    return {
      success: true,
      message: '订阅状态已更新',
      data: {
        needReSubscribe: event.needReSubscribe || false
      }
    }
  } catch (err) {
    console.error(err)
    return {
      success: false,
      message: '更新失败：' + err.message
    }
  }
}
