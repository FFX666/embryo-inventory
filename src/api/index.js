import axios from 'axios'

// 默认指向主机的局域网 IP
const getServerIp = () => localStorage.getItem('server_ip') || '192.168.1.100'
const apiBase = `http://${getServerIp()}:3000/api`

export async function call (channel, payload) {
  try {
    const res = await axios.post(`${apiBase}/${channel}`, payload)
    if (!res.data.success) throw new Error(res.data.message)
    return res.data.data
  } catch (e) {
    if (e.code === 'ERR_NETWORK') throw new Error('无法连接服务器，请检查主机 IP 及网络状态')
    throw e
  }
}

export const api = {
  login: d => call('auth:login', d),
  // ... 保持原有 api 对象里的接口映射不变
}
