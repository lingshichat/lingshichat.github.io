// source/js/runtime.js
var now = new Date();
function createtime() {
    var grt = new Date("01/01/2026 00:00:00"); // ⚠️ 这里修改老师的建站时间
    now.setTime(now.getTime() + 250);
    var days = (now - grt) / 1000 / 60 / 60 / 24;
    var dnum = Math.floor(days);
    var hours = (now - grt) / 1000 / 60 / 60 - (24 * dnum);
    var hnum = Math.floor(hours);
    if (String(hnum).length == 1) { hnum = "0" + hnum; }
    var minutes = (now - grt) / 1000 / 60 - (24 * 60 * dnum) - (60 * hnum);
    var mnum = Math.floor(minutes);
    if (String(mnum).length == 1) { mnum = "0" + mnum; }
    var seconds = (now - grt) / 1000 - (24 * 60 * 60 * dnum) - (60 * 60 * hnum) - (60 * mnum);
    var snum = Math.round(seconds);
    if (String(snum).length == 1) { snum = "0" + snum; }
    
    let currentTimeHtml = "";
    // 如果想要显示“已运行”，就用下面这一行
    currentTimeHtml = "本站已安全运行 " + dnum + " 天 " + hnum + " 小时 " + mnum + " 分 " + snum + " 秒";
    
    // 获取挂载点并写入
    if (document.getElementById("runtime_span")) {
        document.getElementById("runtime_span").innerHTML = currentTimeHtml;
    }
}
setInterval("createtime()", 250);