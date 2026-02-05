// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { openid } = event

  console.log('=== 删除用户云函数开始 ===')
  console.log('OPENID:', openid)
  console.log('调用者OPENID:', wxContext.OPENID)

  // 验证权限：只能删除自己的账号
  if (wxContext.OPENID !== openid) {
    return {
      success: false,
      message: '无权限删除其他用户'
    }
  }

  try {
    // 1. 删除用户基本信息
    console.log('步骤1: 删除用户基本信息')
    try {
      const userRes = await db.collection('users').where({
        _openid: openid
      }).get()

      if (userRes.data.length > 0) {
        const userId = userRes.data[0]._id
        await db.collection('users').doc(userId).remove()
        console.log('用户基本信息删除成功')
      } else {
        console.log('未找到用户信息')
      }
    } catch (err) {
      console.error('删除用户信息失败:', err)
      // 继续执行其他删除操作
    }

    // 2. 删除教练信息（如果存在）
    console.log('步骤2: 删除教练信息')
    try {
      const coachRes = await db.collection('coaches').where({
        _openid: openid
      }).get()

      if (coachRes.data.length > 0) {
        const coachId = coachRes.data[0]._id
        await db.collection('coaches').doc(coachId).remove()
        console.log('教练信息删除成功')
      } else {
        console.log('未找到教练信息')
      }
    } catch (err) {
      console.error('删除教练信息失败:', err)
      // 继续执行其他删除操作
    }

    // 3. 删除预约记录
    console.log('步骤3: 删除预约记录')
    try {
      const bookingsRes = await db.collection('bookings').where({
        studentId: openid
      }).get()

      console.log('找到预约记录:', bookingsRes.data.length, '条')

      for (const booking of bookingsRes.data) {
        await db.collection('bookings').doc(booking._id).remove()
      }
      console.log('预约记录删除成功')
    } catch (err) {
      console.error('删除预约记录失败:', err)
      // 继续执行其他删除操作
    }

    // 4. 删除课程记录
    console.log('步骤4: 删除课程记录')
    try {
      const sessionsRes = await db.collection('sessions').where({
        studentOpenid: openid
      }).get()

      console.log('找到课程记录:', sessionsRes.data.length, '条')

      for (const session of sessionsRes.data) {
        await db.collection('sessions').doc(session._id).remove()
      }
      console.log('课程记录删除成功')
    } catch (err) {
      console.error('删除课程记录失败:', err)
      // 继续执行其他删除操作
    }

    // 5. 删除收藏记录
    console.log('步骤5: 删除收藏记录')
    try {
      const favoritesRes = await db.collection('favorites').where({
        openid: openid
      }).get()

      console.log('找到收藏记录:', favoritesRes.data.length, '条')

      for (const favorite of favoritesRes.data) {
        await db.collection('favorites').doc(favorite._id).remove()
      }
      console.log('收藏记录删除成功')
    } catch (err) {
      console.error('删除收藏记录失败:', err)
      // 继续执行其他删除操作
    }

    // 6. 删除评论记录（如果有）
    console.log('步骤6: 删除评论记录')
    try {
      const commentsRes = await db.collection('comments').where({
        openid: openid
      }).get()

      console.log('找到评论记录:', commentsRes.data.length, '条')

      for (const comment of commentsRes.data) {
        await db.collection('comments').doc(comment._id).remove()
      }
      console.log('评论记录删除成功')
    } catch (err) {
      console.error('删除评论记录失败:', err)
      // 继续执行其他删除操作
    }

    console.log('=== 删除用户云函数完成 ===')

    return {
      success: true,
      message: '账号注销成功'
    }
  } catch (err) {
    console.error('=== 删除用户云函数失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '账号注销失败：' + err.message
    }
  }
}
