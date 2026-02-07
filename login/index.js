// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 管理员账号配置
const ADMIN_OPENIDS = [
  'o1oNQ3RuLrFzMlsU7rle03cyM3Pw'  // 严 - 管理员
]

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { userInfo, selectedRole } = event

  // 默认所有用户角色为'guest'（游客）
  // 管理员需要将游客添加为学员，学员才能预约课程
  // 管理员需要在数据库中手动修改role字段为'admin'或'coach'
  let autoRole = 'guest'

  // 检查是否在管理员白名单中
  if (ADMIN_OPENIDS.includes(wxContext.OPENID)) {
    autoRole = 'admin'
    console.log('识别为管理员账号:', wxContext.OPENID)
  }

  // 确定最终角色（使用数据库中的角色，或默认为学员/管理员）
  let role = autoRole

  console.log('=== 登录云函数开始 ===')
  console.log('OPENID:', wxContext.OPENID)
  console.log('默认角色:', autoRole)
  console.log('用户信息:', userInfo)

  try {
    // 查询用户是否已存在
    const userRes = await db.collection('users').where({
      _openid: wxContext.OPENID
    }).get()

    console.log('查询用户结果:', userRes.data.length)

    let user

    if (userRes.data.length === 0) {
      // 新用户，创建用户记录
      console.log('创建新用户...')

      const createData = {
        _openid: wxContext.OPENID,
        nickname: userInfo?.nickName || '未设置昵称',
        avatarUrl: userInfo?.avatarUrl || '',
        cloudAvatarUrl: userInfo?.avatarUrl || '', // 保存原始云存储URL
        phone: '',
        role: role, // 自动识别的角色（实际角色）
        currentRole: role, // 当前显示角色（管理员可以切换）
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        status: 1
      }

      console.log('创建数据:', createData)

      const addRes = await db.collection('users').add({
        data: createData
      })

      console.log('创建成功，ID:', addRes._id)

      user = {
        _id: addRes._id,
        ...createData
      }
    } else {
      // 已存在用户，更新信息
      console.log('用户已存在，更新信息...')
      user = userRes.data[0]

      // 更新昵称、头像（不强制更新角色，保留用户的现有角色）
      const updateData = {
        updateTime: db.serverDate()
      }

      // 【修复】如果在白名单中但角色不是 admin，则强制修复
      if (autoRole === 'admin' && user.role !== 'admin') {
        console.log('检测到管理员账号角色异常，正在修复:', user.role, '-> admin')
        updateData.role = 'admin'
        if (!user.currentRole || user.currentRole !== 'admin') {
          updateData.currentRole = 'admin'
        }
      }

      // 【修复】同步 currentRole 和 role，确保显示角色与实际角色一致
      // 如果 currentRole 不存在或与 role 不一致，则同步
      if (!user.currentRole || user.currentRole !== user.role) {
        console.log('同步 currentRole:', user.currentRole, '->', user.role)
        updateData.currentRole = user.role
      }

      if (userInfo?.nickName) {
        updateData.nickname = userInfo.nickName
      }

      // 只有当前端传来的是云存储URL时才更新头像
      // 防止临时URL覆盖原始云存储URL
      if (userInfo?.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
        updateData.avatarUrl = userInfo.avatarUrl
        updateData.cloudAvatarUrl = userInfo.avatarUrl // 保存原始云存储URL
      }

      console.log('更新数据:', updateData)

      await db.collection('users').doc(user._id).update({
        data: updateData
      })

      user.nickname = userInfo?.nickName || user.nickname
      user.avatarUrl = userInfo?.avatarUrl || user.avatarUrl

      // 如果修复了角色，更新内存中的用户信息
      if (updateData.role) {
        user.role = updateData.role
      }
      if (updateData.currentRole) {
        user.currentRole = updateData.currentRole
      } else {
        user.currentRole = user.currentRole || user.role
      }

      console.log('更新成功，用户角色:', user.role, '显示角色:', user.currentRole)
    }

    // 如果是教练角色，检查教练信息
    if (role === 'coach') {
      console.log('检查教练信息...')

      const coachRes = await db.collection('coaches').where({
        _openid: wxContext.OPENID
      }).get()

      console.log('教练查询结果:', coachRes.data.length)

      if (coachRes.data.length === 0) {
        // 创建教练基本信息
        console.log('创建教练信息...')

        await db.collection('coaches').add({
          data: {
            _openid: wxContext.OPENID,
            name: user.nickname,
            nickname: user.nickname,
            avatarUrl: user.avatarUrl,
            phone: '',
            specialty: [],
            introduction: '暂无简介',
            experience: '暂无经验说明',
            certifications: [],
            price: 200,
            rating: 5.0,
            reviewCount: 0,
            availableSlots: [],
            status: 1, // 默认可预约
            createTime: db.serverDate(),
            updateTime: db.serverDate()
          }
        })

        console.log('教练信息创建成功')
      }
    }

    console.log('=== 登录成功 ===')
    console.log('返回用户数据:', user)

    return {
      success: true,
      data: user,
      message: '登录成功'
    }
  } catch (err) {
    console.error('=== 登录失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '登录失败：' + err.message
    }
  }
}
