# 挥拍GO - 网球教练教学管理小程序

一个基于微信小程序云开发的网球教学管理系统，支持学员约课、课程记录、视频教学等功能。

## 项目简介

挥拍GO是一款专业的网球教练教学管理平台，为网球教练和学员提供便捷的约课、教学管理和学习体验。

### 核心功能

- **学员约课**：选择教练、预约时间、查看预约状态
- **课程记录**：教练记录训练内容、多维度评分、上传照片视频
- **视频教学**：丰富的教学视频库、分类浏览、收藏收藏
- **消息通知**：预约状态实时推送

### 用户角色

- **学员**：预约课程、查看课程记录、观看教学视频
- **教练**：管理预约、记录课程、上传教学内容
- **管理员**：用户管理、内容审核、数据统计

## 技术栈

- **前端**：微信小程序原生框架 (WXML、WXSS、JavaScript)
- **后端**：微信云开发（云数据库、云存储、云函数）
- **数据库**：云数据库（JSON 文档型）
- **存储**：云存储（视频、图片）

## 快速开始

### 前置要求

- 微信开发者工具（[下载地址](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)）
- 微信小程序账号（[注册地址](https://mp.weixin.qq.com/)）

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd 挥拍GO
   ```

2. **打开项目**
   - 使用微信开发者工具打开项目根目录
   - 选择「小程序」项目类型

3. **配置云开发环境**
   - 点击工具栏的「云开发」按钮
   - 开通云开发环境（免费）
   - 记录环境ID

4. **配置环境ID**
   - 打开 `miniprogram/app.js`
   - 将 `env` 参数替换为你的环境ID：
   ```javascript
   this.globalData = {
     env: "your-env-id", // 替换这里
   }
   ```

5. **初始化数据库**
   - 参考 [DATABASE_SETUP.md](DATABASE_SETUP.md) 文档
   - 创建8个数据库集合
   - 配置索引和权限

6. **部署云函数**
   - 右键点击 `cloudfunctions/login` 目录
   - 选择「上传并部署：云端安装依赖」
   - 等待部署完成

7. **运行项目**
   - 点击「编译」按钮
   - 在模拟器中查看效果
   - 建议在真机上测试授权等功能

## 项目结构

```
挥拍GO/
├── cloudfunctions/          # 云函数目录
│   ├── login/              # 登录云函数
│   └── quickstartFunctions # 示例云函数
├── miniprogram/            # 小程序前端代码
│   ├── images/            # 图片资源
│   ├── pages/             # 页面文件
│   │   ├── index/         # 首页
│   │   ├── login/         # 登录页
│   │   ├── profile/       # 个人中心
│   │   ├── coaches/       # 教练模块
│   │   ├── booking/       # 预约模块
│   │   ├── session/       # 课程记录模块
│   │   └── video/         # 视频教学模块
│   ├── utils/             # 工具函数
│   │   └── util.js        # 通用工具
│   ├── app.js             # 小程序入口
│   ├── app.json           # 全局配置
│   └── app.wxss           # 全局样式
├── DATABASE_SETUP.md      # 数据库配置指南
├── DEVELOPMENT_PROGRESS.md # 开发进度记录
└── README.md              # 项目说明
```

## 数据库设计

项目使用8个云数据库集合：

| 集合名 | 用途 |
|--------|------|
| users | 用户基本信息 |
| coaches | 教练详细信息 |
| bookings | 课程预约记录 |
| sessionRecords | 课程记录与反馈 |
| videos | 教学视频 |
| videoFavorites | 视频收藏 |
| videoViewHistory | 观看历史 |
| notificationLogs | 通知记录 |

详细字段说明请参考 [DATABASE_SETUP.md](DATABASE_SETUP.md)

## 开发进度

- [x] Phase 1: 基础框架搭建
- [ ] Phase 2: 教练与预约模块
- [ ] Phase 3: 课程记录模块
- [ ] Phase 4: 视频教学模块
- [ ] Phase 5: 管理功能与优化

查看详细进度请参考 [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md)

## 主要功能演示

### 学员端
1. 选择教练并预约课程
2. 查看预约状态和课程记录
3. 观看教学视频并收藏

### 教练端
1. 设置可预约时间段
2. 审核预约申请
3. 创建课程记录（评分、反馈、照片视频）
4. 上传教学视频

## 核心技术要点

### 1. 云函数
```javascript
// 调用云函数
wx.cloud.callFunction({
  name: 'login',
  data: { role: 'student' }
}).then(res => {
  console.log(res.result)
})
```

### 2. 数据库操作
```javascript
// 查询数据
const db = wx.cloud.database()
db.collection('users').where({
  _openid: '{openid}'
}).get().then(res => {
  console.log(res.data)
})
```

### 3. 文件上传
```javascript
// 上传到云存储
wx.cloud.uploadFile({
  cloudPath: `videos/${Date.now()}.mp4`,
  filePath: tempFilePath
}).then(res => {
  console.log(res.fileID)
})
```

## 常见问题

### Q: 如何获取云环境ID？
A: 在微信开发者工具中点击「云开发」，在「设置」-「环境」中可以看到环境ID。

### Q: 云函数部署失败怎么办？
A: 检查网络连接，确保已开通云开发服务，尝试重新部署。

### Q: 数据库权限如何配置？
A: 开发阶段可设置为「所有用户可读写」，上线后建议配置更严格的安全规则。

### Q: 如何设置管理员？
A: 首次登录后，在云开发控制台的数据库中将该用户的 `role` 字段改为 `"admin"`。

## 开发文档

- [DATABASE_SETUP.md](DATABASE_SETUP.md) - 数据库配置指南
- [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md) - 开发进度记录
- [微信小程序官方文档](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [云开发官方文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)

## 待办事项

- [ ] 添加更多TabBar图标
- [ ] 完善所有页面开发
- [ ] 添加单元测试
- [ ] 优化UI/UX
- [ ] 接入微信支付
- [ ] 添加数据统计面板

## 贡献指南

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 联系方式

如有问题或建议，欢迎通过以下方式联系：
- 提交 Issue
- 发送邮件

---

**当前版本**：v0.1.0
**最后更新**：2026-01-28
