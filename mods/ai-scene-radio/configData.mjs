// mods/ai-scene-radio/configData.mjs
// 运行时配置数据的内嵌副本。
//
// 唯一真源是同目录 config/ 下的三个 JSON：
//   - config/profile.json    → PROFILE
//   - config/scenes.json     → SCENES
//   - config/exclusions.json → EXCLUSIONS
// 改配置请先改 JSON，再同步本文件。
// 为什么不能直接读 JSON：folia-mod:// 协议只 serve .js/.mjs（electron/modSystem/modProtocol.cjs），
// Folium 没有模组自带文件读取 API，配置只能以常量形式随代码进包。

export const PROFILE = {
    "collectionSample": "QQ 音乐『我喜欢』403 首（归属划分后 Eric 约 302 首），仅作口味分析样本",
    "coreSingers": [
        "王菲",
        "林忆莲",
        "莫文蔚",
        "蔡健雅",
        "孙燕姿"
    ],
    "deepestAxis": [
        "林忆莲",
        "蔡健雅"
    ],
    "note": "Eric 口味画像定版（2026-11-04）。源：qqmusic-archive/口味画像-403全量版.md。选歌按此画像从全曲库选，收藏只是口味样本、不是推荐边界。",
    "summary": "都市质感型·旋律审美派。语种构成：华语约四分之三、英文约四分之一（源自『我喜欢』403 首全量统计，英语 87 首）。华语以优质都市流行与唱将型歌手为底色；英文位是欧美优质流行与 Adult Contemporary（Adele、Taylor Swift、Maroon 5、Ed Sheeran、Coldplay、Charlie Puth、Kelly Clarkson 一类）加上欧美慢板与独立小清新（Lenka 一类），避开 EDM、说唱、重金属。年代不限：经典老歌只是收藏的一部分，他至今仍在持续收藏近年新歌，不要把选歌默认成老歌。共同审美线：旋律品质与人声质感优先，编曲要有层次，情感表达成熟克制，不靠刻意煽情；也收有节奏有爆发的优质流行。『工作时只放慢板』只是场景滤网，不是口味本身。",
    "traits": [
        "旋律优先，好听是第一位",
        "人声质感与声音辨识度",
        "编曲层次与制作精致度",
        "成熟的情感表达，不煽情",
        "都市感、疏离感、留白"
    ]
};

export const SCENES = [
    {
        "batchSize": 15,
        "energyCurve": "先暖后稳：开头温润提神，之后沉稳专注",
        "fallbackPlaylist": "工作·上午",
        "id": "work-morning",
        "label": "工作·上午",
        "mood": [
            "清醒",
            "温润",
            "专注"
        ],
        "tempo": "慢至中速",
        "vocalRatio": "以人声为主，避开情绪浓烈与节奏过炸"
    },
    {
        "batchSize": 15,
        "energyCurve": "午睡后先防困（略带律动与爆发）后沉稳",
        "fallbackPlaylist": "工作·下午",
        "id": "work-afternoon",
        "label": "工作·下午",
        "mood": [
            "防困",
            "明朗",
            "沉稳"
        ],
        "tempo": "中速为主",
        "vocalRatio": "以人声为主，可少量有节奏的优质流行"
    },
    {
        "batchSize": 15,
        "energyCurve": "全程降速，向 00:00 睡觉过渡",
        "fallbackPlaylist": "工作·晚上",
        "id": "work-evening",
        "label": "工作·晚上",
        "mood": [
            "松弛",
            "夜感",
            "收尾"
        ],
        "tempo": "慢速",
        "vocalRatio": "人声放轻，可混少量纯音乐"
    },
    {
        "batchSize": 15,
        "energyCurve": "全程舒展有律动，越听越有感觉",
        "fallbackPlaylist": null,
        "id": "driving",
        "label": "驾车",
        "mood": [
            "律动",
            "旋律鲜明",
            "情绪舒展",
            "耐听"
        ],
        "tempo": "中速至中快",
        "vocalRatio": "人声为主，允许与收藏重复"
    },
    {
        "batchSize": 15,
        "energyCurve": "低存在感，平稳到底",
        "fallbackPlaylist": "读书背景歌单",
        "id": "reading",
        "label": "读书",
        "mood": [
            "安静",
            "背景",
            "不抢注意力"
        ],
        "tempo": "慢速",
        "vocalRatio": "纯音乐优先，人声须极轻"
    }
];

// EXCLUSIONS 只是口味分析时防画像混淆的工具（哪些歌不算 Eric 的口味证据），不是聆听禁令。
// F9 起选歌链路不再读取它：符合画像的歌手（含名单内）照常可选。数据保留作分析溯源，勿删。
export const EXCLUSIONS = {
    "blockedArtists": [
        "1个球",
        "Bao小易",
        "L (桃籽)",
        "PAMajor",
        "Zealot周星星",
        "en (王翊恩)",
        "一棵小葱 / 张曦匀",
        "七元",
        "不大萌",
        "任夏 / 老板",
        "任然",
        "伊格赛听 / 叶里",
        "余又",
        "你的上好佳",
        "兰一三",
        "凌七 (Sage.7)",
        "刘烨溦",
        "刘至佳 / 韩瞳",
        "刘辰希",
        "卢旺达青年团",
        "卢赞",
        "吉他的天空",
        "吉星出租",
        "向思思",
        "周大大",
        "四熹丸子",
        "夏火ww",
        "大头针 Official",
        "宋瑀哲",
        "小咪",
        "小炎同学",
        "小田音乐社 / 尹昔眠",
        "就是南方凯",
        "尹昔眠",
        "崔宇莹",
        "川青",
        "庄东茹",
        "张嘎嘎",
        "张德伊玲",
        "弦外之音",
        "彭清",
        "悦开心",
        "方辰",
        "曹寅",
        "曹雨航 / 朝歌夜弦",
        "李嘉格",
        "李秉成",
        "梦境里的算法official",
        "梦里啥都有",
        "欧阳耀莹",
        "毒药",
        "江语晨",
        "浩然H.R",
        "焦七七",
        "王唯旖",
        "王大毛",
        "王樾安",
        "王靖雯",
        "白小白",
        "盖君炎",
        "程佳佳",
        "程响",
        "竹子ZZ",
        "羊羊",
        "老板",
        "胡66",
        "舞雪 / 离梦lc",
        "艾辰",
        "苏妙玲",
        "菲道尔",
        "赵乃吉",
        "路知鹤",
        "邓寓君 (等什么君)",
        "邓岳章",
        "阿YueYue",
        "阿YueYue / 戾格 / 小田音乐社",
        "阿YueYue / 镜予歌",
        "陈小满",
        "陈崎凡",
        "陈抒妮",
        "陈默默",
        "黑屋乐队"
    ],
    "blockedSongs": [
        {
            "title": "雨过后的风景",
            "artist": "羊羊",
            "confidence": "suspected"
        },
        {
            "title": "活埋 (2026女生新版)",
            "artist": "竹子ZZ",
            "confidence": "confirmed"
        },
        {
            "title": "我恨明月不照我",
            "artist": "阿YueYue",
            "confidence": "confirmed"
        },
        {
            "title": "bad boy",
            "artist": "梦里啥都有",
            "confidence": "suspected"
        },
        {
            "title": "重来一遍",
            "artist": "焦七七",
            "confidence": "confirmed"
        },
        {
            "title": "思念成灾 (遗憾男版)",
            "artist": "老板",
            "confidence": "confirmed"
        },
        {
            "title": "他真的对你好吗 (粤语版)",
            "artist": "邓岳章",
            "confidence": "confirmed"
        },
        {
            "title": "贴水浮莲",
            "artist": "彭清",
            "confidence": "suspected"
        },
        {
            "title": "深爱过的人怎么放手 (女声心碎版)",
            "artist": "弦外之音",
            "confidence": "confirmed"
        },
        {
            "title": "风说",
            "artist": "陈默默",
            "confidence": "suspected"
        },
        {
            "title": "秋风 (粤语版)",
            "artist": "四熹丸子",
            "confidence": "suspected"
        },
        {
            "title": "戒不掉 (原声版)",
            "artist": "欧阳耀莹",
            "confidence": "suspected"
        },
        {
            "title": "爱在时光里回响",
            "artist": "卢赞",
            "confidence": "suspected"
        },
        {
            "title": "不如回家喝自来水",
            "artist": "刘烨溦",
            "confidence": "suspected"
        },
        {
            "title": "我该怎么描写遗憾",
            "artist": "向思思",
            "confidence": "suspected"
        },
        {
            "title": "江湖之间",
            "artist": "曹雨航 / 朝歌夜弦",
            "confidence": "suspected"
        },
        {
            "title": "如风似梦",
            "artist": "苏妙玲",
            "confidence": "suspected"
        },
        {
            "title": "最后一页",
            "artist": "江语晨",
            "confidence": "suspected"
        },
        {
            "title": "爱久见人心 (R&B)",
            "artist": "梦境里的算法official",
            "confidence": "suspected"
        },
        {
            "title": "致未来的你我",
            "artist": "白小白",
            "confidence": "suspected"
        },
        {
            "title": "轻舞",
            "artist": "陈抒妮",
            "confidence": "suspected"
        },
        {
            "title": "爱如空气 (R&B版)",
            "artist": "夏火ww",
            "confidence": "suspected"
        },
        {
            "title": "备用 (我要你对我坦诚)",
            "artist": "张嘎嘎",
            "confidence": "suspected"
        },
        {
            "title": "你看你看月亮的脸",
            "artist": "大头针 Official",
            "confidence": "confirmed"
        },
        {
            "title": "空心 (烟嗓男版)",
            "artist": "大头针 Official",
            "confidence": "confirmed"
        },
        {
            "title": "我多想拥抱你",
            "artist": "黑屋乐队",
            "confidence": "suspected"
        },
        {
            "title": "作罢 (爱也罢恨也罢就此作罢)",
            "artist": "Bao小易",
            "confidence": "suspected"
        },
        {
            "title": "满目星辰皆是你 (世间万物一切都不及你)",
            "artist": "凌七 (Sage.7)",
            "confidence": "suspected"
        },
        {
            "title": "曲终人亦散 (灯火意阑珊)",
            "artist": "PAMajor",
            "confidence": "suspected"
        },
        {
            "title": "空心 (无法割舍就别怕感伤)",
            "artist": "兰一三",
            "confidence": "suspected"
        },
        {
            "title": "他他他",
            "artist": "艾辰",
            "confidence": "suspected"
        },
        {
            "title": "吹梦到西洲",
            "artist": "舞雪 / 离梦lc",
            "confidence": "suspected"
        },
        {
            "title": "浪人心声",
            "artist": "吉他的天空",
            "confidence": "suspected"
        },
        {
            "title": "反正我也没什么关系",
            "artist": "庄东茹",
            "confidence": "suspected"
        },
        {
            "title": "沦陷",
            "artist": "李嘉格",
            "confidence": "suspected"
        },
        {
            "title": "转身即心痛",
            "artist": "吉星出租",
            "confidence": "suspected"
        },
        {
            "title": "谁 (治愈版)",
            "artist": "赵乃吉",
            "confidence": "suspected"
        },
        {
            "title": "舍得",
            "artist": "王唯旖",
            "confidence": "suspected"
        },
        {
            "title": "为你放下所有",
            "artist": "焦七七",
            "confidence": "confirmed"
        },
        {
            "title": "只为你着迷",
            "artist": "李秉成",
            "confidence": "suspected"
        },
        {
            "title": "镜花影",
            "artist": "阿YueYue",
            "confidence": "confirmed"
        },
        {
            "title": "Not snow,but U",
            "artist": "七元",
            "confidence": "suspected"
        },
        {
            "title": "此去半生",
            "artist": "L (桃籽)",
            "confidence": "suspected"
        },
        {
            "title": "回不去的你和我 (大雪漫天的飘落)",
            "artist": "方辰",
            "confidence": "suspected"
        },
        {
            "title": "破碎的梦 (女版)",
            "artist": "崔宇莹",
            "confidence": "suspected"
        },
        {
            "title": "Cheri Cheri Lady",
            "artist": "毒药",
            "confidence": "suspected"
        },
        {
            "title": "今晚不想睡",
            "artist": "王大毛",
            "confidence": "suspected"
        },
        {
            "title": "壁上观",
            "artist": "一棵小葱 / 张曦匀",
            "confidence": "suspected"
        },
        {
            "title": "新雨旧梦",
            "artist": "阿YueYue",
            "confidence": "confirmed"
        },
        {
            "title": "千秋迭梦",
            "artist": "阿YueYue / 镜予歌",
            "confidence": "confirmed"
        },
        {
            "title": "爱殇",
            "artist": "阿YueYue",
            "confidence": "confirmed"
        },
        {
            "title": "为敌",
            "artist": "阿YueYue",
            "confidence": "confirmed"
        },
        {
            "title": "成瘾",
            "artist": "陈崎凡",
            "confidence": "suspected"
        },
        {
            "title": "天下的乌鸦一般黑",
            "artist": "小炎同学",
            "confidence": "suspected"
        },
        {
            "title": "阿拉斯加海湾",
            "artist": "菲道尔",
            "confidence": "suspected"
        },
        {
            "title": "多想还小",
            "artist": "路知鹤",
            "confidence": "suspected"
        },
        {
            "title": "会开花的云",
            "artist": "王樾安",
            "confidence": "suspected"
        },
        {
            "title": "离别开出花",
            "artist": "就是南方凯",
            "confidence": "suspected"
        },
        {
            "title": "此生不换",
            "artist": "en (王翊恩)",
            "confidence": "suspected"
        },
        {
            "title": "流离",
            "artist": "Zealot周星星",
            "confidence": "suspected"
        },
        {
            "title": "年少的你啊",
            "artist": "浩然H.R",
            "confidence": "suspected"
        },
        {
            "title": "寻屿",
            "artist": "阿YueYue",
            "confidence": "confirmed"
        },
        {
            "title": "望",
            "artist": "周大大",
            "confidence": "suspected"
        },
        {
            "title": "爱是奖励还是惩罚",
            "artist": "陈小满",
            "confidence": "suspected"
        },
        {
            "title": "春庭雪",
            "artist": "邓寓君 (等什么君)",
            "confidence": "suspected"
        },
        {
            "title": "可能",
            "artist": "程响",
            "confidence": "confirmed"
        },
        {
            "title": "用情 (架子鼓版)",
            "artist": "羊羊",
            "confidence": "suspected"
        },
        {
            "title": "海与天",
            "artist": "余又",
            "confidence": "suspected"
        },
        {
            "title": "死心 (非洲波波版)",
            "artist": "卢旺达青年团",
            "confidence": "confirmed"
        },
        {
            "title": "死心",
            "artist": "任夏 / 老板",
            "confidence": "confirmed"
        },
        {
            "title": "故事终章",
            "artist": "程响",
            "confidence": "confirmed"
        },
        {
            "title": "只若初见",
            "artist": "张德伊玲",
            "confidence": "suspected"
        },
        {
            "title": "不做情人",
            "artist": "邓岳章",
            "confidence": "confirmed"
        },
        {
            "title": "魔鬼邂逅",
            "artist": "邓岳章",
            "confidence": "confirmed"
        },
        {
            "title": "我走后",
            "artist": "小咪",
            "confidence": "suspected"
        },
        {
            "title": "未出现传闻",
            "artist": "胡66",
            "confidence": "suspected"
        },
        {
            "title": "生分",
            "artist": "川青",
            "confidence": "suspected"
        },
        {
            "title": "有人",
            "artist": "不大萌",
            "confidence": "suspected"
        },
        {
            "title": "江上晚风吟",
            "artist": "小田音乐社 / 尹昔眠",
            "confidence": "confirmed"
        },
        {
            "title": "憾情",
            "artist": "阿YueYue",
            "confidence": "confirmed"
        },
        {
            "title": "旧灯错",
            "artist": "阿YueYue",
            "confidence": "confirmed"
        },
        {
            "title": "沈园外",
            "artist": "阿YueYue / 戾格 / 小田音乐社",
            "confidence": "confirmed"
        },
        {
            "title": "比拟",
            "artist": "阿YueYue",
            "confidence": "confirmed"
        },
        {
            "title": "止渴",
            "artist": "阿YueYue",
            "confidence": "confirmed"
        },
        {
            "title": "不负人间",
            "artist": "阿YueYue",
            "confidence": "confirmed"
        },
        {
            "title": "大雨还在下",
            "artist": "1个球",
            "confidence": "suspected"
        },
        {
            "title": "落海",
            "artist": "任然",
            "confidence": "confirmed"
        },
        {
            "title": "别错过",
            "artist": "程佳佳",
            "confidence": "suspected"
        },
        {
            "title": "时光背面的我",
            "artist": "刘至佳 / 韩瞳",
            "confidence": "suspected"
        },
        {
            "title": "奔赴星空",
            "artist": "尹昔眠",
            "confidence": "suspected"
        },
        {
            "title": "白鸽",
            "artist": "你的上好佳",
            "confidence": "suspected"
        },
        {
            "title": "我想要",
            "artist": "盖君炎",
            "confidence": "suspected"
        },
        {
            "title": "小朋友",
            "artist": "任然",
            "confidence": "confirmed"
        },
        {
            "title": "别想他",
            "artist": "悦开心",
            "confidence": "suspected"
        },
        {
            "title": "那年·年少",
            "artist": "宋瑀哲",
            "confidence": "suspected"
        },
        {
            "title": "沦陷",
            "artist": "王靖雯",
            "confidence": "confirmed"
        },
        {
            "title": "四季予你",
            "artist": "程响",
            "confidence": "confirmed"
        },
        {
            "title": "谪仙",
            "artist": "伊格赛听 / 叶里",
            "confidence": "suspected"
        },
        {
            "title": "山外小楼夜听雨",
            "artist": "任然",
            "confidence": "confirmed"
        },
        {
            "title": "我爱过的那个人",
            "artist": "曹寅",
            "confidence": "suspected"
        },
        {
            "title": "思念是一把刀",
            "artist": "刘辰希",
            "confidence": "suspected"
        }
    ]
};
