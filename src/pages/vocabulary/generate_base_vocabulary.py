import json
import re
from collections import OrderedDict, defaultdict
from pathlib import Path

from pypdf import PdfReader


CUR_DIR = Path(__file__).absolute().parent
PDF_PATH = CUR_DIR / '3000词汇表.pdf'
OUTPUT_PATH = CUR_DIR / 'base-vocabulary.js'

POS_PATTERN = (
    r"vt\.&vi\.|vi\.&vt\.|n\.\&vt\.|aux\.v\.&vi\.|vt\.vi\.|vt\.\&vi\.\&n\.|"
    r"adj\.\&pron\.|int\.\&n\.\&vt\.|conj\.\s*&\s*adv\.|n\.\&vi\.|n\./adj\.|"
    r"n\./v\.|v\./n\.|adv\./adj\.|adj\./pron\.|vt\.|vi\.|n\.|adj\.|adv\.|"
    r"prep\.|conj\.|pron\.|art\.|aux\.v\.|v\.|a\.|ad\."
)

ENTRY_PATTERN = re.compile(
    rf"([A-Za-z][A-Za-z'().&/\-]*(?:\s+[A-Za-z][A-Za-z'().&/\-]*)*)\s+({POS_PATTERN})"
)

POS_NORMALIZE_MAP = {
    'a.': 'adj.',
    'ad.': 'adv.',
    'vt.vi.': 'vt./vi.',
    'vt.&vi.': 'vt./vi.',
    'vi.&vt.': 'vi./vt.',
    'n.&vt.': 'n./vt.',
    'n.&vi.': 'n./vi.',
    'adj.&pron.': 'adj./pron.',
    'conj. & adv.': 'conj./adv.',
}

CATEGORY_DEFINITIONS = [
    ('B01_基础连接与虚词', '连接、指代、介词、冠词、助动词等高频基础功能词'),
    ('B02_时间数量与顺序', '时间、日期、数字、频率、顺序和阶段表达'),
    ('B03_人物家庭与关系', '人物、身份、家庭成员和人际关系'),
    ('B04_身体健康与情绪', '身体部位、疾病健康、情绪心理与感受'),
    ('B05_日常生活与居家', '居家生活、衣食住行中的日常高频词'),
    ('B06_学校工作与商业', '学校、学习、工作、职场与商业活动'),
    ('B07_社会法律与政府', '社会秩序、法律、政治、组织与公共事务'),
    ('B08_城市交通与旅行', '地点、建筑、出行、交通和旅行场景'),
    ('B09_自然环境与动植物', '自然环境、天气地理、动物植物与生态'),
    ('B10_科技媒体与文化', '科技、媒体、艺术、历史与文化表达'),
    ('B11_核心动作动词', '基础高频动作词，适合作为句子骨架优先记忆'),
    ('B12_思维表达与社交', '思考、表达、讨论、社交互动相关词'),
    ('B13_核心描述形容词', '高频描述性形容词，帮助快速读懂句意'),
    ('B14_高频名词补充', '未归入主题类的高频基础名词'),
    ('B15_高频副词与补充', '高频副词、补充类词和剩余基础词'),
]


def extract_pdf_text():
    reader = PdfReader(str(PDF_PATH))
    text = '\n'.join((page.extract_text() or '') for page in reader.pages)
    text = re.sub(r'3000必备词汇\s*\n?\s*\d+\s*', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def normalize_pos(pos: str) -> str:
    return POS_NORMALIZE_MAP.get(pos.strip(), pos.strip())


def normalize_meaning(meaning: str) -> str:
    meaning = meaning.strip()
    meaning = re.sub(r'\s+', ' ', meaning)
    meaning = meaning.replace('； ', '；')
    return meaning or '-'


def load_entries():
    text = extract_pdf_text()
    matches = list(ENTRY_PATTERN.finditer(text))
    entries = []
    seen = set()

    for index, match in enumerate(matches, start=1):
        end = matches[index].start() if index < len(matches) else len(text)
        word = match.group(1).strip()
        pos = normalize_pos(match.group(2))
        meaning = normalize_meaning(text[match.end():end])
        normalized_word = word.lower()

        if normalized_word in seen:
            continue
        seen.add(normalized_word)

        entries.append({
            'id': index,
            'word': [word],
            'pos': pos,
            'meaning': meaning,
            'example': '-',
            'extra': '来自《3000词汇表》，已按更易记忆的方式重新归类',
            'spellError': False,
            'spellValue': '',
            'showSource': False,
        })

    return entries


def contains_any(text: str, keywords):
    return any(keyword in text for keyword in keywords)


def is_function_word(entry):
    pos = entry['pos']
    return pos.startswith(('prep.', 'conj.', 'pron.', 'art.', 'aux.v.'))


def is_time_number_word(entry):
    word = entry['word'][0].lower()
    meaning = entry['meaning']
    direct_words = {
        'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
        'september', 'october', 'november', 'december',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'today', 'tomorrow', 'yesterday', 'morning', 'afternoon', 'evening', 'night',
        'week', 'weekend', 'month', 'year', 'hour', 'minute', 'second', 'daily',
        'weekly', 'monthly', 'annual', 'annually', 'century', 'future', 'past',
        'before', 'after', 'during', 'while', 'first', 'second', 'third', 'final',
        'finally', 'later', 'early', 'late',
    }
    keywords = ['年', '月', '日', '周', '星期', '钟', '秒', '时间', '时期', '时代', '顺序', '阶段', '期间', '频率', '次数', '年龄', '世纪', '季度', '立即', '随后', '最终', '开始', '结束', '先前', '以后', '以前', '未来', '过去', '总数', '数量', '平均']
    return word in direct_words or contains_any(meaning, keywords)


def is_people_word(entry):
    meaning = entry['meaning']
    keywords = ['人', '家庭', '父', '母', '兄', '弟', '姐', '妹', '儿', '女', '婴儿', '成人', '男', '女', '妻', '夫', '朋友', '伙伴', '邻居', '客人', '观众', '听众', '读者', '作者', '工人', '员工', '助手', '老板', '上司', '代理人', '律师', '警察', '教师', '学生']
    return contains_any(meaning, keywords)


def is_body_health_emotion_word(entry):
    meaning = entry['meaning']
    keywords = ['身体', '健康', '病', '痛', '药', '医院', '医生', '护士', '头', '眼', '耳', '鼻', '口', '牙', '手', '脚', '腿', '臂', '胸', '背', '脑', '心', '胃', '肺', '血', '骨', '呼吸', '睡', '醒', '疲劳', '焦虑', '愤怒', '高兴', '悲伤', '害怕', '惊奇', '紧张', '情绪', '感情', '爱', '恨', '羞', '疼痛']
    return contains_any(meaning, keywords)


def is_daily_life_word(entry):
    meaning = entry['meaning']
    keywords = ['家', '房', '室', '床', '门', '窗', '墙', '桌', '椅', '厨房', '浴室', '衣', '鞋', '帽', '包', '瓶', '碗', '盘', '杯', '食物', '饭', '肉', '面包', '蔬菜', '水果', '酒', '水', '洗', '烤', '买', '卖', '钱夹', '口袋', '行李', '饼干', '瓶子', '钱包']
    return contains_any(meaning, keywords)


def is_school_work_business_word(entry):
    meaning = entry['meaning']
    keywords = ['学', '校', '教育', '课程', '考试', '学术', '学院', '办公室', '工作', '职业', '公司', '商业', '贸易', '广告', '价格', '工资', '银行', '账户', '预算', '合同', '交易', '申请', '任命', '会议', '文件', '代理', '商店', '老板', '雇员']
    return contains_any(meaning, keywords)


def is_society_law_gov_word(entry):
    meaning = entry['meaning']
    keywords = ['社会', '法律', '政府', '国家', '战争', '军队', '警报', '法院', '律师', '权力', '当局', '政策', '政治', '选举', '投票', '组织', '协会', '官方', '武器', '暴力', '胜利', '受害者']
    return contains_any(meaning, keywords)


def is_city_travel_word(entry):
    meaning = entry['meaning']
    keywords = ['城市', '乡村', '村庄', '道路', '街', '桥', '机场', '飞机', '航空', '船', '港', '交通', '旅行', '旅馆', '公寓', '车辆', '自行车', '火车', '车', '边界', '路线', '方向', '到达', '出发', '步行']
    return contains_any(meaning, keywords)


def is_nature_word(entry):
    meaning = entry['meaning']
    keywords = ['自然', '环境', '天气', '气候', '空气', '大气', '水', '海', '河', '山', '谷', '森林', '岩', '石', '土', '地球', '太阳', '月亮', '星', '动物', '植物', '鸟', '鱼', '树', '花', '草', '农', '季节', '风', '雨', '雪']
    return contains_any(meaning, keywords)


def is_tech_media_culture_word(entry):
    meaning = entry['meaning']
    keywords = ['科技', '技术', '电脑', '网络', '视频', '广播', '媒体', '艺术', '文化', '历史', '科学', '电影', '音乐', '图像', '录音', '字母', '语言', '文章', '论文', '艺术家', '演员']
    return contains_any(meaning, keywords)


def is_core_action_verb(entry):
    pos = entry['pos']
    if not any(flag in pos for flag in ['vt', 'vi', 'v.']):
        return False
    meaning = entry['meaning']
    if contains_any(meaning, ['说', '讲', '告诉', '问', '答', '想', '认为', '知道', '理解', '解释', '讨论', '同意', '承认', '保证', '感觉']):
        return False
    return True


def is_thinking_expression_word(entry):
    meaning = entry['meaning']
    keywords = ['想', '认为', '知道', '理解', '记住', '说', '讲', '告诉', '问', '答', '讨论', '争论', '解释', '表明', '决定', '计划', '希望', '相信', '感觉', '注意', '意见', '态度', '交流', '呼吁', '保证', '承认', '同意', '宣布', '道歉']
    return contains_any(meaning, keywords)


def is_descriptive_adjective(entry):
    pos = entry['pos']
    return pos.startswith(('adj.', 'a.'))


def is_noun_word(entry):
    pos = entry['pos']
    return pos.startswith('n.')


def is_adverb_word(entry):
    pos = entry['pos']
    return pos.startswith(('adv.', 'ad.'))


def categorize_entry(entry):
    checks = [
        ('B01_基础连接与虚词', is_function_word),
        ('B02_时间数量与顺序', is_time_number_word),
        ('B03_人物家庭与关系', is_people_word),
        ('B04_身体健康与情绪', is_body_health_emotion_word),
        ('B05_日常生活与居家', is_daily_life_word),
        ('B06_学校工作与商业', is_school_work_business_word),
        ('B07_社会法律与政府', is_society_law_gov_word),
        ('B08_城市交通与旅行', is_city_travel_word),
        ('B09_自然环境与动植物', is_nature_word),
        ('B10_科技媒体与文化', is_tech_media_culture_word),
        ('B12_思维表达与社交', is_thinking_expression_word),
        ('B11_核心动作动词', is_core_action_verb),
        ('B13_核心描述形容词', is_descriptive_adjective),
        ('B14_高频名词补充', is_noun_word),
        ('B15_高频副词与补充', is_adverb_word),
    ]

    for category, checker in checks:
        if checker(entry):
            return category
    return 'B15_高频副词与补充'


def build_groups(entries, group_size=8):
    groups = []
    current = []
    for entry in entries:
        current.append(entry)
        if len(current) >= group_size:
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return groups


def generate():
    entries = load_entries()
    grouped_entries = defaultdict(list)
    for entry in entries:
        grouped_entries[categorize_entry(entry)].append(entry)

    output = OrderedDict()
    for label, _desc in CATEGORY_DEFINITIONS:
        entries_in_category = grouped_entries.get(label, [])
        if not entries_in_category:
            continue
        entries_in_category.sort(key=lambda item: item['word'][0].lower())
        groups = build_groups(entries_in_category)
        output[label] = {
            'label': label,
            'source': 'base3000',
            'audio': '',
            'groupCount': len(groups),
            'wordCount': len(entries_in_category),
            'words': groups,
        }

    js_code = f"""/**
  * Generated from 3000词汇表.pdf
  * source = base3000
  */

const baseVocabulary = {json.dumps(output, ensure_ascii=False)}

export default baseVocabulary
"""
    OUTPUT_PATH.write_text(js_code)

    print('Generated', OUTPUT_PATH.name)
    for label, body in output.items():
        print(label, body['wordCount'])


if __name__ == '__main__':
    generate()
