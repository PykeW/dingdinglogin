import express from 'express'
import { contact_1_0, oauth2_1_0 } from '@alicloud/dingtalk'
import * as $OpenApi from '@alicloud/openapi-client'
import * as $Util from '@alicloud/tea-util'

const CLIENTID = 'ding3tzwvbu0dvxdtunc' // 应用 client_id
const CLIENTSECRET = 'mQuZdUKdrjP945fUL4lopBDzibthaBulQkOaglMi2N22VmZdt7HI9Oyx_T7GQRYF' // 应用 client_secret

const app = express()
app.use(express.static('public'))

// 添加 CORS 中间件
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
  next();
});

/**
 * 获取用户授权
 */
app.get('/auth', async (req, res) => {
  console.log('收到认证请求，authCode:', req.query.authCode);
  
  const config = new $OpenApi.Config({ })
  config.protocol = 'https'
  config.regionId = 'central'
  
  try {
    const client = new oauth2_1_0.default(config)
    const getUserTokenRequest = new oauth2_1_0.GetUserTokenRequest({
      clientId: CLIENTID,
      clientSecret: CLIENTSECRET,
      code: req.query.authCode,
      refreshToken: '',
      grantType: 'authorization_code',
    })
    
    console.log('准备获取用户token...');
    const result = await client.getUserToken(getUserTokenRequest)
    console.log('获取token结果:', result.body);
    
    console.log('准备获取用户信息...');
    const info = await getUserInfo(result.body.accessToken)
    console.log('用户信息:', info.body);
    console.log('部门IDs:', info.body.deptIds);
    
    // 构造返回数据
    const responseData = {
      ackey: result.body,
      info: info.body,
      department: null
    };

    if (info.body && info.body.deptIds && Array.isArray(info.body.deptIds) && info.body.deptIds.length > 0) {
      console.log('存在部门ID，准备获取部门信息...');
      try {
        const deptInfo = await getDepartmentInfo(
          result.body.accessToken, 
          info.body.deptIds[0]
        );
        console.log('部门信息:', deptInfo.body);
        responseData.department = deptInfo.body;
      } catch (deptError) {
        console.error('获取部门信息失败:', deptError);
        responseData.departmentError = deptError.message;
      }
    } else {
      console.log('用户没有部门信息 deptIds:', info.body.deptIds);
    }

    res.json({ data: responseData });
    
  } catch (err) {
    console.error('服务器错误详情:', {
      message: err.message,
      stack: err.stack,
      details: err
    });
    
    res.status(500).json({ 
      error: err.message,
      details: err
    });
  }
})

app.listen(3666, '0.0.0.0', () => {
  console.log(`Example app listening on http://106.14.28.97:3666`)
})

/**
 * 获取用户信息
 * @param {string} accessToken
 * @returns 用户信息返回体
 */
async function getUserInfo (accessToken) {
  console.log('开始获取用户信息，accessToken:', accessToken);
  const config = new $OpenApi.Config({ })
  config.protocol = 'https'
  config.regionId = 'central'
  const client = new contact_1_0.default(config)
  const getUserHeader = new contact_1_0.GetUserHeaders()
  getUserHeader.xAcsDingtalkAccessToken = accessToken
  try {
    const infoRes = await client.getUserWithOptions('me', getUserHeader, new $Util.RuntimeOptions())
    console.log('获取用户信息成功:', infoRes.body);
    return infoRes;
  } catch (error) {
    console.error('获取用户信息失败:', error);
    throw error;
  }
}

/**
 * 获取用户部门信息
 * @param {string} accessToken
 * @param {string} deptId
 * @returns 部门信息返回体
 */
async function getDepartmentInfo(accessToken, deptId) {
  console.log('开始获取部门信息:', { accessToken, deptId });
  
  if (!deptId) {
    throw new Error('部门ID不能为空');
  }

  const config = new $OpenApi.Config({})
  config.protocol = 'https'
  config.regionId = 'central'
  const client = new contact_1_0.default(config)
  const getDeptHeader = new contact_1_0.GetDepartmentHeaders()
  getDeptHeader.xAcsDingtalkAccessToken = accessToken
  
  try {
    const deptRes = await client.getDepartmentWithOptions(deptId, getDeptHeader, new $Util.RuntimeOptions())
    console.log('获取部门信息成功:', deptRes.body);
    return deptRes;
  } catch (error) {
    console.error('获取部门信息失败:', error);
    throw error;
  }
}

