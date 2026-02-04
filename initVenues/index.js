// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  console.log('=== 初始化球馆数据云函数开始 ===')
  console.log('OPENID:', wxContext.OPENID)

  try {
    // 检查是否已经有球馆数据
    const existingVenues = await db.collection('venues').get()

    if (existingVenues.data.length > 0) {
      console.log('球馆数据已存在，跳过初始化')
      return {
        success: true,
        message: '球馆数据已存在',
        count: existingVenues.data.length
      }
    }

    // 初始化球馆数据
    const venuesData = [
      {
        name: '滨水',
        address: '滨水球馆',
        description: '设施齐全，环境舒适',
        imageUrl: '',
        operatingHours: {
          open: '09:00',
          close: '18:00'
        },
        status: 1,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      },
      {
        name: '万科',
        address: '万科球馆',
        description: '交通便利，专业场地',
        imageUrl: '',
        operatingHours: {
          open: '09:00',
          close: '18:00'
        },
        status: 1,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      },
      {
        name: '世纪城',
        address: '世纪城球馆',
        description: '宽敞明亮，设备先进',
        imageUrl: '',
        operatingHours: {
          open: '09:00',
          close: '18:00'
        },
        status: 1,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    ]

    // 批量添加球馆数据
    const addPromises = venuesData.map(venue =>
      db.collection('venues').add({ data: venue })
    )

    const results = await Promise.all(addPromises)

    console.log('球馆数据初始化成功，添加了', results.length, '条记录')

    return {
      success: true,
      message: '球馆数据初始化成功',
      count: results.length,
      venueIds: results.map(r => r._id)
    }

  } catch (err) {
    console.error('=== 初始化球馆数据失败 ===')
    console.error('错误信息:', err)

    return {
      success: false,
      message: '初始化失败：' + err.message
    }
  }
}
