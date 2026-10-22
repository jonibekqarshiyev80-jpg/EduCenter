
const $ = (selector) => document.querySelector(selector);

const DAY_ORDER = [
  'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba',
  'Juma', 'Shanba', 'Yakshanba'
];

const PAGE_INFO = {
  dashboard: ['Bosh sahifa', 'Markazingiz faoliyatini bir joyda kuzating.'],
  students: ['O‘quvchilar', 'O‘quvchilarni qo‘shing va boshqaring.'],
  schedule: ['Dars jadvali', 'Darslarni qulay rejalashtiring.'],
  groups: ['Guruhlar va kurslar', 'Kurslar va guruhlarni ko‘rib chiqing.']
};

let students = [];
let teachers = [];
let schedules = [];
let studentLoadFailed = false;
let teacherLoadFailed = false;
let scheduleLoadFailed = false;

function showPage(pageId) {
  if (!PAGE_INFO[pageId]) return;

  document.querySelectorAll('.page').forEach((page) => {
    page.hidden = page.id !== pageId;
  });

  document.querySelectorAll('.nav-link').forEach((button) => {
    const active = button.dataset.page === pageId;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  $('#pageTitle').textContent = PAGE_INFO[pageId][0];
  $('#pageSubtitle').textContent = PAGE_INFO[pageId][1];
}

function setMessage(selector, message, isError = false) {
  const element = $(selector);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? '#d74d65' : '';
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new Error(data?.message || `Server xatosi: ${response.status}`);
  }

  return data;
}

function getId(item) {
  return item?._id?.toString?.() || item?.id || '';
}

function escapeInitial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

function formatDate() {
  $('#todayDate').textContent = new Intl.DateTimeFormat('uz-UZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  $('#currentYear').textContent = new Date().getFullYear();
}

function updateConnectionStatus() {
  const online = !studentLoadFailed && !teacherLoadFailed && !scheduleLoadFailed;
  const dot = $('.status-dot');

  dot.classList.toggle('online', online);
  dot.classList.toggle('offline', !online);

  $('#connectionText').textContent = online
    ? 'Ma’lumotlar yuklandi'
    : 'Ayrim ma’lumotlar yuklanmadi';
}

async function loadStudents() {
  try {
    const data = await apiRequest('/api/students');
    if (!Array.isArray(data)) throw new Error('O‘quvchilar ro‘yxati noto‘g‘ri');

    students = data;
    studentLoadFailed = false;
  } catch (error) {
    studentLoadFailed = true;
    console.error('O‘quvchilarni yuklash:', error);
  }
}

async function loadTeachers() {
  try {
    const data = await apiRequest('/api/teachers');
    if (!Array.isArray(data)) throw new Error('O‘qituvchilar ro‘yxati noto‘g‘ri');

    teachers = data;
    teacherLoadFailed = false;
  } catch (error) {
    teacherLoadFailed = true;
    console.error('O‘qituvchilarni yuklash:', error);
  }
}

async function loadSchedules() {
  try {
    const data = await apiRequest('/api/schedules');
    if (!Array.isArray(data)) throw new Error('Dars jadvali noto‘g‘ri');

    schedules = data;
    scheduleLoadFailed = false;
  } catch (error) {
    scheduleLoadFailed = true;
    console.error('Dars jadvalini yuklash:', error);
  }
}

function uniqueValues(values) {
  return [...new Set(
    values.map(value => String(value || '').trim()).filter(Boolean)
  )];
}

function getCourses() {
  return uniqueValues(students.map(student => student.course))
    .sort((a, b) => a.localeCompare(b, 'uz'));
}

function getGroups() {
  return uniqueValues(schedules.map(item => item.group))
    .sort((a, b) => a.localeCompare(b, 'uz'));
}

function renderStats() {
  $('#studentCount').textContent = studentLoadFailed ? '—' : students.length;
  $('#teacherCount').textContent = teacherLoadFailed ? '—' : teachers.length;
  $('#groupCount').textContent = scheduleLoadFailed ? '—' : getGroups().length;
  $('#scheduleCount').textContent = scheduleLoadFailed ? '—' : schedules.length;

  $('#studentListCount').textContent =
    studentLoadFailed ? 'Xatolik' : `${students.length} ta`;

  $('#scheduleListCount').textContent =
    scheduleLoadFailed ? 'Xatolik' : `${schedules.length} ta`;

  $('#groupsPageCount').textContent =
    scheduleLoadFailed ? '—' : getGroups().length;

  $('#coursesPageCount').textContent =
    studentLoadFailed ? '—' : getCourses().length;
}

function renderCourseChart() {
  const container = $('#courseChart');
  container.replaceChildren();

  if (studentLoadFailed) {
    container.textContent = 'Kurs statistikasi uchun ma’lumotlarni yuklab bo‘lmadi.';
    container.className = 'chart-list empty-state';
    return;
  }

  const counts = {};
  students.forEach(student => {
    const course = String(student.course || '').trim() || 'Kurs belgilanmagan';
    counts[course] = (counts[course] || 0) + 1;
  });

  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (!entries.length) {
    container.className = 'chart-list';
    container.textContent = 'Kurs statistikasi hali mavjud emas.';
    return;
  }

  const maxCount = Math.max(...entries.map(entry => entry[1]), 1);
  container.className = 'chart-list';

  entries.forEach(([course, count]) => {
    const item = document.createElement('div');
    item.className = 'chart-item';

    const labelRow = document.createElement('div');
    labelRow.className = 'chart-label-row';

    const label = document.createElement('span');
    label.textContent = course;

    const value = document.createElement('strong');
    value.textContent = `${count} ta`;

    labelRow.append(label, value);

    const track = document.createElement('div');
    track.className = 'chart-track';
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', String(maxCount));
    track.setAttribute('aria-valuenow', String(count));
    track.setAttribute('aria-label', course);

    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.width = `${Math.max(count / maxCount * 100, 3)}%`;

    track.appendChild(bar);
    item.append(labelRow, track);
    container.appendChild(item);
  });
}

function renderRecentStudents() {
  const container = $('#recentStudents');
  container.replaceChildren();

  if (studentLoadFailed) {
    container.textContent = 'O‘quvchilarni yuklashda xatolik yuz berdi.';
    container.className = 'recent-list empty-state';
    return;
  }

  container.className = 'recent-list';

  const recent = [...students].slice(-5).reverse();

  if (!recent.length) {
    container.textContent = 'Hozircha o‘quvchilar qo‘shilmagan.';
    container.className = 'recent-list empty-state';
    return;
  }

  recent.forEach(student => {
    const row = document.createElement('div');
    row.className = 'recent-row';

    const avatar = document.createElement('div');
    avatar.className = 'person-avatar';
    avatar.textContent = escapeInitial(student.name);

    const info = document.createElement('div');
    info.className = 'recent-info';

    const name = document.createElement('strong');
    name.textContent = student.name || 'Ism kiritilmagan';

    const details = document.createElement('small');
    details.textContent = [
      student.course || 'Kurs belgilanmagan',
      student.phone || 'Telefon yo‘q'
    ].join(' · ');

    info.append(name, details);
    row.append(avatar, info);
    container.appendChild(row);
  });
}

function renderStudents() {
  const container = $('#studentList');
  container.replaceChildren();

  if (studentLoadFailed) {
    container.className = 'student-grid empty-state';
    container.textContent = 'O‘quvchilarni yuklab bo‘lmadi. Server va API sozlamalarini tekshiring.';
    return;
  }

  container.className = 'student-grid';

  const query = $('#studentSearch').value.trim().toLocaleLowerCase('uz');

  const filtered = students.filter(student => {
    const text = [
      student.name, student.phone, student.course
    ].join(' ').toLocaleLowerCase('uz');

    return text.includes(query);
  });

  $('#studentListSubtitle').textContent =
    query ? 'Qidiruv natijalari' : 'Barcha o‘quvchilar';

  if (!filtered.length) {
    container.textContent = query
      ? 'Qidiruv bo‘yicha o‘quvchi topilmadi.'
      : 'Hozircha o‘quvchilar yo‘q. Yuqoridagi forma orqali qo‘shing.';
    container.className = 'student-grid empty-state';
    return;
  }

  filtered.forEach(student => {
    const card = document.createElement('article');
    card.className = 'student-card';

    const head = document.createElement('div');
    head.className = 'student-card-head';

    const avatar = document.createElement('div');
    avatar.className = 'person-avatar';
    avatar.textContent = escapeInitial(student.name);

    const info = document.createElement('div');

    const name = document.createElement('h3');
    name.textContent = student.name || 'Ism kiritilmagan';

    const phone = document.createElement('p');
    phone.textContent = student.phone || 'Telefon ko‘rsatilmagan';

    info.append(name, phone);
    head.append(avatar, info);

    const course = document.createElement('span');
    course.className = 'course-chip';
    course.textContent = `📚 ${student.course || 'Kurs belgilanmagan'}`;

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger-button';
    remove.textContent = 'O‘chirish';

    remove.addEventListener('click', async () => {
      const id = getId(student);

      if (!id) {
        setMessage('#studentMessage', 'O‘quvchining ID raqami topilmadi.', true);
        return;
      }

      if (!confirm(`${student.name || 'Ushbu o‘quvchi'}ni o‘chirmoqchimisiz?`)) {
        return;
      }

      remove.disabled = true;

      try {
        await apiRequest(`/api/students/${encodeURIComponent(id)}`, {
          method: 'DELETE'
        });

        setMessage('#studentMessage', 'O‘quvchi o‘chirildi.');
        await refreshData();
      } catch (error) {
        setMessage('#studentMessage', error.message, true);
        remove.disabled = false;
      }
    });

    actions.appendChild(remove);
    card.append(head, course, actions);
    container.appendChild(card);
  });
}

function renderSchedules() {
  const container = $('#scheduleList');
  container.replaceChildren();

  if (scheduleLoadFailed) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'empty-state';
    cell.textContent = 'Jadval yuklanmadi. /api/schedules API mavjudligini tekshiring.';
    row.appendChild(cell);
    container.appendChild(row);
    return;
  }

  const sorted = [...schedules].sort((a, b) =>
    DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) ||
    String(a.startTime || '').localeCompare(String(b.startTime || ''))
  );

  if (!sorted.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'empty-state';
    cell.textContent = 'Hozircha darslar yo‘q. Yuqoridagi forma orqali qo‘shing.';
    row.appendChild(cell);
    container.appendChild(row);
    return;
  }

  sorted.forEach(item => {
    const row = document.createElement('tr');

    const lessonCell = document.createElement('td');
    const lessonWrap = document.createElement('div');
    lessonWrap.className = 'lesson-name';

    const mark = document.createElement('span');
    mark.className = 'lesson-mark';
    mark.textContent = '📘';

    const title = document.createElement('strong');
    title.textContent = item.lesson || 'Dars';

    lessonWrap.append(mark, title);
    lessonCell.appendChild(lessonWrap);

    const values = [
      item.group || '—',
      item.teacher || '—'
    ];

    values.forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(lessonCell);
      lessonCell.remove();
      row.appendChild(cell);
    });

    const dayCell = document.createElement('td');
    const dayChip = document.createElement('span');
    dayChip.className = 'day-chip';
    dayChip.textContent = item.day || '—';
    dayCell.appendChild(dayChip);

    const timeCell = document.createElement('td');
    timeCell.textContent = `${item.startTime || '—'} – ${item.endTime || '—'}`;

    const roomCell = document.createElement('td');
    roomCell.textContent = item.room || '—';

    const actionCell = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger-button';
    remove.textContent = 'O‘chirish';

    remove.addEventListener('click', async () => {
      const id = getId(item);

      if (!id) {
        setMessage('#scheduleMessage', 'Dars ID raqami topilmadi.', true);
        return;
      }

      if (!confirm('Ushbu darsni o‘chirmoqchimisiz?')) return;

      remove.disabled = true;

      try {
        await apiRequest(`/api/schedules/${encodeURIComponent(id)}`, {
          method: 'DELETE'
        });
        setMessage('#scheduleMessage', 'Dars jadvaldan o‘chirildi.');
        await refreshData();
      } catch (error) {
        setMessage('#scheduleMessage', error.message, true);
        remove.disabled = false;
      }
    });

    actionCell.appendChild(remove);
    row.append(lessonCell, dayCell, timeCell, roomCell, actionCell);
    container.appendChild(row);
  });
}

function renderGroupsAndCourses() {
  const groupContainer = $('#groupList');
  const courseContainer = $('#courseList');

  groupContainer.replaceChildren();
  courseContainer.replaceChildren();

  const groups = getGroups();
  const courses = getCourses();

  if (scheduleLoadFailed) {
    groupContainer.textContent = 'Guruhlar uchun dars jadvalini yuklab bo‘lmadi.';
    groupContainer.className = 'entity-list empty-state';
  } else if (!groups.length) {
    groupContainer.textContent = 'Guruhlar yo‘q. Dars jadvaliga guruh qo‘shing.';
    groupContainer.className = 'entity-list empty-state';
  } else {
    groupContainer.className = 'entity-list';

    groups.forEach(group => {
      const groupSchedules = schedules.filter(item => item.group === group);
      const card = createEntityCard(
        '👥',
        group,
        `${groupSchedules.length} ta dars jadvalda`,
        'schedule'
      );
      groupContainer.appendChild(card);
    });
  }

  if (studentLoadFailed) {
    courseContainer.textContent = 'Kurslarni yuklab bo‘lmadi.';
    courseContainer.className = 'entity-list empty-state';
  } else if (!courses.length) {
    courseContainer.textContent = 'Kurslar yo‘q. O‘quvchi qo‘shayotganda kurs nomini kiriting.';
    courseContainer.className = 'entity-list empty-state';
  } else {
    courseContainer.className = 'entity-list';

    courses.forEach(course => {
      const count = students.filter(student => student.course === course).length;
      const card = createEntityCard(
        '📚',
        course,
        `${count} ta o‘quvchi`,
        'students'
      );
      courseContainer.appendChild(card);
    });
  }
}

function createEntityCard(icon, titleText, description, targetPage) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'entity-card';
  card.style.width = '100%';
  card.style.textAlign = 'left';
  card.style.color = 'inherit';

  const symbol = document.createElement('span');
  symbol.className = 'entity-icon';
  symbol.textContent = icon;

  const info = document.createElement('span');
  info.className = 'entity-info';

  const title = document.createElement('strong');
  title.textContent = titleText;

  const small = document.createElement('small');
  small.textContent = description;

  info.append(title, small);
  card.append(symbol, info);
  card.addEventListener('click', () => showPage(targetPage));

  return card;
}

async function refreshData() {
  await Promise.all([
    loadStudents(),
    loadTeachers(),
    loadSchedules()
  ]);

  renderStats();
  renderCourseChart();
  renderRecentStudents();
  renderStudents();
  renderSchedules();
  renderGroupsAndCourses();
  updateConnectionStatus();
}

$('#studentSearch').addEventListener('input', renderStudents);

$('#studentForm').addEventListener('submit', async event => {
  event.preventDefault();

  const submit = $('#studentForm button[type="submit"]');
  const student = {
    name: $('#studentName').value.trim(),
    phone: $('#studentPhone').value.trim(),
    course: $('#studentCourse').value.trim()
  };

  if (!student.name) {
    setMessage('#studentMessage', 'O‘quvchi ismini kiriting.', true);
    return;
  }

  submit.disabled = true;

  try {
    await apiRequest('/api/students', {
      method: 'POST',
      body: JSON.stringify(student)
    });

    $('#studentForm').reset();
    setMessage('#studentMessage', 'O‘quvchi muvaffaqiyatli qo‘shildi.');
    await refreshData();
  } catch (error) {
    setMessage('#studentMessage', error.message, true);
  } finally {
    submit.disabled = false;
  }
});

$('#scheduleForm').addEventListener('submit', async event => {
  event.preventDefault();

  const submit = $('#scheduleForm button[type="submit"]');

  const startTime = $('#startTime').value;
  const endTime = $('#endTime').value;

  if (startTime >= endTime) {
    setMessage(
      '#scheduleMessage',
      'Tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak.',
      true
    );
    return;
  }

  const schedule = {
    lesson: $('#lesson').value.trim(),
    group: $('#scheduleGroup').value.trim(),
    teacher: $('#scheduleTeacher').value.trim(),
    day: $('#scheduleDay').value,
    startTime,
    endTime,
    room: $('#room').value.trim()
  };

  submit.disabled = true;

  try {
    await apiRequest('/api/schedules', {
      method: 'POST',
      body: JSON.stringify(schedule)
    });

    $('#scheduleForm').reset();
    setMessage('#scheduleMessage', 'Dars jadvalga muvaffaqiyatli qo‘shildi.');
    await refreshData();
  } catch (error) {
    setMessage('#scheduleMessage', error.message, true);
  } finally {
    submit.disabled = false;
  }
});

async function init() {
  formatDate();
  showPage('dashboard');
  await refreshData();
}

init();
