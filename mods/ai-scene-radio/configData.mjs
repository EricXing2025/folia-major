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
    "note": "Eric 口味画像定版（2026-11-04 两版合并：ChatGPT 画像＋403 首全量数据画像；2026-11-07 综合完善，v1.1.7）。源：qqmusic-archive/口味画像-403全量版.md 与音乐侧聊中 ChatGPT 画像原文。选歌按此画像从全曲库选，收藏只是口味样本、不是推荐边界。",
    "summary": "都市质感型·旋律审美派——成熟都市流行审美，旋律优先，人声质感优先，兼具节奏与情绪表达。审美主线 = Adult Contemporary（成人当代流行）＋华语都市流行＋Soul/R&B 气质。他不是怀旧派，也不是纯情歌爱好者：审美开放，但有一条稳定主线——好听、有质感、有表达，经得起反复聆听和时间检验，不靠刻意煽情，不是所有流行作品都能进入他的长期收藏。\n审美标尺：① 不喜欢表达单薄的歌：只有一句抓耳副歌的作品不行，要旋律、声音、情绪共同建立感染力；② 接受情绪复杂性：矛盾、遗憾、释然、力量可以同时存在，不要求歌一定快乐或悲伤；③ 既要细节也要冲击力：安静耐听的可以，充满节奏与爆发的也可以；④ 编曲不喧宾夺主，但要有层次和亮点；⑤ 歌词不是唯一驱动力，整体制作与音乐性同样重要。\n核心歌手与锚点：王菲（个性、空灵、克制；锚点：《棋子》《百年孤寂》《笑忘书》）——能欣赏抽象、不刻意解释情绪的音乐；林忆莲（都市感、律动、R&B 细节；锚点：《归零》《Now Or Never》《夜太黑》）；莫文蔚（松弛、故事感、独特声线；锚点：《阴天》《忽然之间》）——没有炫技却有鲜明个人表达的声音他最认；蔡健雅（创作感、编曲与制作感；锚点：《空白格》《别找我麻烦》《陌生人》）；孙燕姿（清澈、自由、生命力；锚点：《直来直往》《神奇》《愚人的国度》）——他也喜欢明快、有个性、有节奏的歌。其中林忆莲与蔡健雅最能揭示他的底层审美逻辑，王菲与莫文蔚代表他对声音个性和情感表达的偏爱。\n歌手格局：女声主导，收藏里女声约六成。男声认成熟叙事一路：李宗盛（《山丘》）、张宇（《口是心非》）、张学友、张信哲、陈奕迅（《不要说话》）——成熟、叙事、声音有情感厚度。外围常听女声：邓紫棋、周笔畅、张靓颖、梁静茹、张惠妹、田馥甄；创作型男声：周深、林俊杰、陶喆、方大同、李荣浩。只收唱功型、音色辨识度高的歌手，不收纯流量偶像。\n题材与意象：爱情、思念、错过类情歌为绝对主体（歌名高频字：爱、人、风、雨、心、想、天、花、梦、月），偏爱风、雨、月、花、梦、海等自然意象的抒情表达；苦情、遗憾是经典慢板型，不要网络心碎型。\n版本偏好（他最显著的行为特征）：收歌入口高度依赖音综与现场：收藏里 Live/现场版约 29 首、音综节目专辑约 27 首、影视原声约 17 首，多是看节目、刷到现场被打动就收。翻唱收得很多，不执着原唱；对版本差异敏感，同一首歌会收不同版本（如《阴天》《太想爱你》都有多个版本在藏）。选歌时正式发行的 Live/音综版可以放心选；不要 DJ 版、remix 和带『男版/女声版/心碎版』等版本噱头标注的网络歌曲。\n语种构成：华语约四分之三，英文约四分之一（收藏统计英语 87 首）。英文位分三线：① 欧美流行大单曲与成人当代（Adele《Hello》、Kelly Clarkson《Because of You》、Maroon 5《This Love》、Taylor Swift、One Direction、Charlie Puth、Ed Sheeran、Coldplay、Alan Walker、Linkin Park）；② 乡村线（Josh Turner、Lady A）；③ 独立小清新线（Vienna Teng、Sarah Harmer、Ingrid Michaelson、Sasha Sloan、Lenka）；外加 Carpenters 这类经典。英文位避开 EDM、说唱、重金属。粤语成一小线：陈慧娴、杨千嬅、BEYOND、林峯、吴雨霏。韩语日语只是点缀（李贞贤、中岛美嘉等），不要成批推。\n节奏、民谣与器乐：他能接受王菲的克制，也能欣赏 Adele 的强烈爆发：Counting Stars、This Love 这类有节奏有爆发的优质流行是他的正经口味，励志/正能量是少数派点缀（《海阔天空》《光芒》）。叙事民谣一路也收：赵雷《成都》的朴素叙事、GALA《Young For You》。器乐成体系：莫扎特小夜曲、《克罗地亚狂想曲》、久石让《菊次郎的夏天》钢琴版、大提琴组曲等纯净器乐，读书与专注场景可少量穿插。\n年代：不限年代——1990—2010 港台黄金期是地基、欧美流行是第二层，但他至今仍在持续收藏近年新歌，选歌不要默认老歌。\n『工作时只放慢板』只是场景滤网，不是口味本身。",
    "traits": [
        "旋律优先，好听是第一位",
        "人声质感与声音辨识度，只收唱功型歌手",
        "编曲有层次但不喧宾夺主，重视整体制作",
        "成熟克制的情感表达，不靠煽情",
        "情绪可以复杂：遗憾、释然、力量并存",
        "表达不能单薄：一句副歌抓耳的不行",
        "经得起反复聆听，耐听比一时抓耳重要",
        "女声主导，核心五人＋成熟叙事男声",
        "音综与现场版是正经收歌入口，翻唱可收，对版本敏感",
        "自然意象抒情（风、雨、月、花、梦、海）",
        "英文约四分之一：欧美大单曲＋乡村＋独立小清新，避 EDM/说唱",
        "年代不限，持续收新歌；节奏爆发与安静耐听都要"
    ]
};

export const SCENES = [
    {
        "batchSize": 15,
        "energyCurve": "随当前时段在提神专注、防困沉稳、降速收尾之间自然过渡",
        "fallbackPlaylist": "工作·下午",
        "id": "work",
        "label": "工作",
        "mood": [
            "专注"
        ],
        "tempo": "随时段",
        "timeBands": [
            {
                "energyCurve": "深夜低能量，安静收尾",
                "mood": [
                    "夜感",
                    "松弛",
                    "收尾"
                ],
                "tempo": "慢速",
                "until": 5,
                "vocalRatio": "人声放轻，可混少量纯音乐"
            },
            {
                "energyCurve": "先暖后稳：开头温润提神，之后沉稳专注",
                "mood": [
                    "清醒",
                    "温润",
                    "专注"
                ],
                "tempo": "慢至中速",
                "until": 11,
                "vocalRatio": "以人声为主，避开情绪浓烈与节奏过炸"
            },
            {
                "energyCurve": "午后先防困（略带律动与爆发）后沉稳",
                "mood": [
                    "防困",
                    "明朗",
                    "沉稳"
                ],
                "tempo": "中速为主",
                "until": 17,
                "vocalRatio": "以人声为主，可少量有节奏的优质流行"
            },
            {
                "energyCurve": "全程降速，向休息过渡",
                "mood": [
                    "松弛",
                    "夜感",
                    "收尾"
                ],
                "tempo": "慢速",
                "until": 24,
                "vocalRatio": "人声放轻，可混少量纯音乐"
            }
        ],
        "vocalRatio": "以人声为主"
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
    },
    {
        "allowRepeats": true,
        "batchSize": 15,
        "energyCurve": "随此刻的时段、天气与季节自然流动，越听越有感觉",
        "fallbackPlaylist": null,
        "id": "free",
        "label": "随心听",
        "mood": [
            "随心",
            "耐听",
            "舒展"
        ],
        "tempo": "不限",
        "vocalRatio": "人声为主，器乐也可"
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
