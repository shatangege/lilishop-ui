class WsSocket {
  /**
   * Websocket 连接
   *
   * @var Websocket
   */
  connect;

  /**
   * 服务器连接地址
   */
  url;

  /**
   * 配置信息
   *
   * @var Object
   */
  config = {
    heartbeat: {
      enabled: false, // 是否发送心跳包
      time: 10000, // 心跳包发送间隔时长
      setInterval: null, // 心跳包计时器
    },
    reconnect: {
      lockReconnect: false,
      setTimeout: null, // 计时器对象
      time: 5000, // 重连间隔时间
      number: 1000, // 重连次数
    },
  };

  /**
   * 自定义绑定消息事件
   *
   * @var Array
   */
  onCallBacks = [];

  /**
   * 创建 WsSocket 的实例
   *
   * @param {Function} urlCallBack url闭包函数
   * @param {Object} events 原生 WebSocket 绑定事件
   */
  constructor(urlCallBack, events) {
    this.urlCallBack = urlCallBack;

    // 定义 WebSocket 原生方法
    this.events = Object.assign(
      {
        onError: (evt) => { },
        onOpen: (evt) => { },
        onClose: (evt) => { },
      },
      events
    );
  }

  /**
   * 事件绑定
   *
   * @param {String} event 事件名
   * @param {Function} callBack 回调方法
   */
  on (event, callBack) {
    // 对应 socket-instance.js
    this.onCallBacks[event] = callBack;
    return this;
  }

  /**
   * 加载 WebSocket
   */
  loadSocket () {
    // 判断当前是否已经连接
    if (this.connect != null) {
      this.connect.close();
      this.connect = null;
    }

    this.url = this.urlCallBack();
    const connect = new WebSocket(this.url);
    connect.onerror = this.onError.bind(this);
    connect.onopen = this.onOpen.bind(this);
    connect.onmessage = this.onMessage.bind(this);
    connect.onclose = this.onClose.bind(this);

    this.connect = connect;
  }

  /**
   * 连接 Websocket
   */
  connection () {
    this.loadSocket();
  }

  /**
   * 掉线重连 Websocket
   */
  reconnect () {
    console.log("掉线重连接");
    let reconnect = this.config.reconnect;
    if (reconnect.lockReconnect || reconnect.number == 0) {
      return;
    }

    this.config.reconnect.lockReconnect = true;

    // 没连接上会一直重连，设置延迟避免请求过多
    reconnect.setTimeout && clearTimeout(reconnect.setTimeout);

    this.config.reconnect.setTimeout = setTimeout(() => {
      this.connection();

      this.config.reconnect.lockReconnect = false;
      this.config.reconnect.number--;

      console.log(
        `网络连接已断开，正在尝试重新连接(${this.config.reconnect.number})...`
      );
    }, reconnect.time);
  }

  /**
   * 解析接受的消息
   *
   * @param {Object} evt Websocket 消息
   */
  onParse (evt) {

    const res = JSON.parse(evt.data).result;

    //如果创建时间是时间戳类型则转换为 日期类型，否则新压入栈的消息的创建时间和从数据库读取出来的创建时间格式对不上，处理的时候会出异常。
    if (typeof res.createTime == "number") {
      res.createTime = this.unixToDate(res.createTime, "yyyy-MM-dd hh:mm");
    }
    return res;
  }

  /**
   * 将unix时间戳转换为指定格式
   * @param unix   时间戳【秒】
   * @param format 转换格式
   * @returns {*|string}
   */
  unixToDate (unix, format) {
    if (!unix) return unix;
    let _format = format || "yyyy-MM-dd hh:mm:ss";
    const d = new Date(unix);
    const o = {
      "M+": d.getMonth() + 1,
      "d+": d.getDate(),
      "h+": d.getHours(),
      "m+": d.getMinutes(),
      "s+": d.getSeconds(),
      "q+": Math.floor((d.getMonth() + 3) / 3),
      S: d.getMilliseconds(),
    };
    if (/(y+)/.test(_format))
      _format = _format.replace(
        RegExp.$1,
        (d.getFullYear() + "").substr(4 - RegExp.$1.length)
      );
    for (const k in o)
      if (new RegExp("(" + k + ")").test(_format))
        _format = _format.replace(
          RegExp.$1,
          RegExp.$1.length === 1
            ? o[k]
            : ("00" + o[k]).substr(("" + o[k]).length)
        );
    return _format;
  }

  /**
   * 打开连接
   *
   * @param {Object} evt Websocket 消息
   */
  onOpen (evt) {
    this.events.onOpen(evt);

    if (this.config.heartbeat.enabled) {
      this.heartbeat();
    }
  }

  /**
   * 关闭连接
   *
   * @param {Object} evt Websocket 消息
   */
  onClose (evt) {
    console.log("关闭连接", evt);
    if (this.config.heartbeat.enabled) {
      clearInterval(this.config.heartbeat.setInterval);
    }
    console.log("evt", evt);

    if (evt.code == 1006) {
      this.reconnect();
    }

    // this.events.onClose(evt);
  }

  /**
   * 连接错误
   *
   * @param {Object} evt Websocket 消息
   */
  onError (evt) {
    this.events.onError(evt);
  }

  /**
   * 接收消息
   *
   * @param {Object} evt Websocket 消息
   */
  onMessage (evt) {
    let result = this.onParse(evt);
    console.log("接收消息", result, "color:red");
    // 判断消息事件是否被绑定
    // event_talk;
    let params = {
      ...this.onParse(evt),
      text: JSON.parse(this.onParse(evt).text)
    }
    // 指定推送消息
    this.onCallBacks["event_talk"](params);
  }

  /**
   * WebSocket心跳检测
   */
  heartbeat () {
    console.log("WebSocket心跳检测");
    this.config.heartbeat.setInterval = setInterval(() => {
      this.connect.send("PING");
    }, this.config.heartbeat.time);
  }

  /**
   * 聊天发送数据
   *
   * @param {Object} message
   */
  send (message) {
    this.connect.send(JSON.stringify(message));
  }

  /**
   * 关闭连接
   */
  close () {
    this.connect.close();
  }

  /**
   * 推送消息
   *
   * @param {String} event 事件名
   * @param {Object} data 数据
   */
  emit (event, data) {
    if (this.connect && this.connect.readyState === 1) {
      this.connect.send(JSON.stringify(data));
    } else {
      console.error("WebSocket 连接已关闭...", this.connect);
    }
  }
}

export default WsSocket;
