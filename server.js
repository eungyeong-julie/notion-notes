// .env 파일의 환경변수 불러오기
require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.static('public')); // public/index.html 서빙

// Notion 설정
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// 오늘 날짜를 YYYY-MM-DD 형식으로 (항상 한국 시간 기준으로) 반환
function getToday() {
  const now = new Date();

  // 서버가 어디 있든, 한국 시간(Asia/Seoul)으로 변환
  const koreaNow = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' })
  );

  const y = koreaNow.getFullYear();
  const m = String(koreaNow.getMonth() + 1).padStart(2, '0');
  const d = String(koreaNow.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

// 오늘(Date)이 오늘인 페이지를 찾고, 없으면 새로 생성
async function getOrCreateTodayPage() {
  const today = getToday();

  // 1) 오늘 날짜 페이지 검색 (Date 필터)
  const queryRes = await fetch(`${NOTION_API_BASE}/databases/${DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: {
        property: 'Date',       // Date 프로퍼티 이름
        date: {
          equals: today,        // 오늘 날짜와 같은 row만
        },
      },
      page_size: 1,
    }),
  });

  if (!queryRes.ok) {
    const text = await queryRes.text();
    throw new Error('Notion DB query 실패: ' + queryRes.status + ' ' + text);
  }

  const queryData = await queryRes.json();

  // 이미 오늘 날짜 페이지가 있으면 그 페이지 사용
  if (queryData.results && queryData.results.length > 0) {
    return queryData.results[0].id;
  }

  // 2) 없으면 새 페이지 생성 (DAY-ID title + Date 세팅)
  const todayTitle = today; // "YYYY-MM-DD"

  const createRes = await fetch(`${NOTION_API_BASE}/pages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: {
        database_id: DATABASE_ID,
      },
      properties: {
        // Title 필드 이름: DAY-ID
        'DAY-ID': {
          title: [
            {
              type: 'text',
              text: {
                content: todayTitle,
              },
            },
          ],
        },
        // Date 필드 이름: Date
        'Date': {
          date: {
            start: today,
          },
        },
      },
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error('오늘 날짜 페이지 생성 실패: ' + createRes.status + ' ' + text);
  }

  const createData = await createRes.json();
  return createData.id;
}

// 특정 페이지에 텍스트 블록 추가
async function appendTextToPage(pageId, text) {
  const res = await fetch(`${NOTION_API_BASE}/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: text,
                },
              },
            ],
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const textBody = await res.text();
    throw new Error('텍스트 블록 추가 실패: ' + res.status + ' ' + textBody);
  }
}

// 프론트에서 호출하는 엔드포인트
app.post('/add-text', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ message: 'text 내용을 보내 주세요.' });
    }

    const pageId = await getOrCreateTodayPage(); // 오늘 페이지 찾거나 생성
    await appendTextToPage(pageId, text);        // 거기에 텍스트 블록 추가

    res.json({ success: true, pageId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message || '서버 오류' });
  }
});

// 테스트용
app.get('/hello', (req, res) => {
  res.send('서버 살아있음!');
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});