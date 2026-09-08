import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const assets = path.join(root, 'docs', 'mobile-screenshots');
const outputDir = path.join(root, 'docs');
const output = path.join(outputDir, 'kaft-chess-academy-mobile-guide.pptx');
fs.mkdirSync(outputDir, { recursive: true });

const pptx = new pptxgen();
pptx.defineLayout({ name: 'WIDE_GUIDE', width: 13.333, height: 7.5 });
pptx.layout = 'WIDE_GUIDE';
pptx.author = 'Kaft Chess Academy';
pptx.subject = 'Mobile app walkthrough';
pptx.title = 'Kaft Chess Academy | Mobile app guide';
pptx.company = 'Kaft Chess Academy';
pptx.lang = 'en-US';
pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };

const C = {
  navy: '0A192F',       // Deep rich obsidian navy
  navy2: '112240',      // Elevated dark surface
  navy3: '1E3A5F',      // Card stroke / subtle highlight
  blue: '20639B',       // Accent blue
  gold: 'D5A347',       // Warm metallic gold
  gold2: 'F3D99F',      // Light radiant champagne
  ink: '1E293B',        // Deep body text for light slides
  muted: '64748B',      // Slate muted text
  subtle: '8892B0',     // Light slate
  lightText: 'CCD6F6',  // Off-white / light slate text
  cream: 'F8FAFC',      // Crisp modern slate-light background
  white: 'FFFFFF',      // Pure white
  cardLight: 'FFFFFF',  // Light card surface
  pale: 'E2E8F0',       // Border color light
  mint: 'E6FFFA',       // Mint background
  green: '10B981',      // Emerald accent
  coral: 'F43F5E'       // Modern vibrant coral
};

// Precise mobile phone geometry matching 1081x1999 (0.54077 aspect ratio)
// With h = 5.65 in: image h = 5.37, image w = 2.904, phone w = 3.18
const PHONE = {
  x: 1.05,
  y: 1.25,
  w: 3.18,
  h: 5.65,
  pad: 0.138,
  imgW: 2.904,
  imgH: 5.37
};

// Content column on the right
const CONTENT = {
  x: 4.85,
  w: 7.75
};

function addText(slide, value, options = {}) {
  slide.addText(value, { fontFace: 'Aptos', margin: 0, fit: 'shrink', ...options });
}

function addBase(slide, dark = false) {
  slide.background = { color: dark ? C.navy : C.cream };
  // Top thin accent rule
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.gold }, line: { color: C.gold } });
  // Footer subtle watermark
  addText(slide, 'KAFT CHESS ACADEMY  |  MOBILE WORKSPACE', {
    x: 0.8, y: 7.14, w: 4.0, h: 0.16,
    fontSize: 7, bold: true, charSpacing: 1.8,
    color: dark ? '4A5D78' : C.muted
  });
}

function addTitle(slide, heading, kicker, dark = false) {
  addText(slide, kicker.toUpperCase(), {
    x: 0.8, y: 0.38, w: 6.0, h: 0.18,
    fontSize: 7.8, bold: true, charSpacing: 2.0,
    color: dark ? C.gold2 : C.gold
  });
  addText(slide, heading, {
    x: 0.78, y: 0.62, w: 9.5, h: 0.48,
    fontFace: 'Aptos Display', fontSize: 24, bold: true,
    color: dark ? C.white : C.navy
  });
}

function addCard(slide, x, y, w, h, heading, body, dark = false, accent = C.gold) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    rectRadius: 0.08,
    fill: { color: dark ? C.navy2 : C.white },
    line: { color: dark ? C.navy3 : C.pale, width: 0.8 }
  });
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w: 0.07, h,
    fill: { color: accent },
    line: { color: accent }
  });
  addText(slide, heading, {
    x: x + 0.28, y: y + 0.22, w: w - 0.48, h: 0.23,
    fontSize: 13, bold: true, color: dark ? C.white : C.navy
  });
  addText(slide, body, {
    x: x + 0.28, y: y + 0.62, w: w - 0.48, h: h - 0.78,
    fontSize: 10.5, breakLine: false,
    color: dark ? 'D9E5EF' : C.ink, valign: 'top'
  });
}

function addPhone(slide, name, geometry = PHONE) {
  const { x, y, w, h, pad, imgW, imgH } = geometry;
  // Sleek device bezel with subtle shadow
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    rectRadius: 0.22,
    fill: { color: '07111E' },
    line: { color: '2A4365', width: 1.5 },
    shadow: { type: 'outer', color: '000000', blur: 6, angle: 90, distance: 3, opacity: 0.35 }
  });
  // Inner screen display bezel
  slide.addShape(pptx.ShapeType.roundRect, {
    x: x + pad - 0.01, y: y + pad - 0.01,
    w: imgW + 0.02, h: imgH + 0.02,
    rectRadius: 0.14,
    fill: { color: '000000' },
    line: { color: '07111E', width: 0.5 }
  });
  // Device screen screenshot
  slide.addImage({
    path: path.join(assets, `${name}.png`),
    x: x + pad, y: y + pad,
    w: imgW, h: imgH
  });
  // Top dynamic speaker / camera pill
  slide.addShape(pptx.ShapeType.roundRect, {
    x: x + (w - 0.9) / 2, y: y + 0.045,
    w: 0.9, h: 0.08,
    rectRadius: 0.04,
    fill: { color: '1A2634' },
    line: { color: '07111E' }
  });
}

function addScreenSlide({ name, heading, kicker, description, points, outcome }, screenIndex, totalScreens) {
  const slide = pptx.addSlide();
  addBase(slide, true);
  addTitle(slide, heading, kicker, true);

  // Top-right screen badge
  const numStr = String(screenIndex).padStart(2, '0');
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 11.2, y: 0.42, w: 1.35, h: 0.38,
    rectRadius: 0.08,
    fill: { color: C.navy2 },
    line: { color: C.navy3, width: 0.8 }
  });
  addText(slide, `SCREEN ${numStr} / ${totalScreens}`, {
    x: 11.2, y: 0.52, w: 1.35, h: 0.16,
    fontSize: 7.5, bold: true, charSpacing: 1.2,
    color: C.gold2, align: 'center'
  });

  // Phone Mockup (left column)
  addPhone(slide, name);

  // Top Description Card
  slide.addShape(pptx.ShapeType.roundRect, {
    x: CONTENT.x, y: 1.25, w: CONTENT.w, h: 0.65,
    rectRadius: 0.08,
    fill: { color: C.navy2 },
    line: { color: C.navy3, width: 0.8 }
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: CONTENT.x, y: 1.25, w: 0.08, h: 0.65,
    fill: { color: C.blue }, line: { color: C.blue }
  });
  addText(slide, description, {
    x: CONTENT.x + 0.28, y: 1.34, w: CONTENT.w - 0.5, h: 0.48,
    fontSize: 13, bold: false, color: C.lightText, breakLine: false
  });

  // 3 Enterprise Feature Pillar Cards
  let cardY = 2.08;
  const cardH = 0.96;
  const cardGap = 0.22;
  const accents = [C.gold, C.blue, C.green];

  points.forEach((item, idx) => {
    const acc = accents[idx % accents.length];
    // Card background container
    slide.addShape(pptx.ShapeType.roundRect, {
      x: CONTENT.x, y: cardY, w: CONTENT.w, h: cardH,
      rectRadius: 0.08,
      fill: { color: C.navy2 },
      line: { color: C.navy3, width: 0.8 }
    });
    // Left accent strip
    slide.addShape(pptx.ShapeType.rect, {
      x: CONTENT.x, y: cardY, w: 0.06, h: cardH,
      fill: { color: acc }, line: { color: acc }
    });
    // Number pill indicator
    slide.addShape(pptx.ShapeType.roundRect, {
      x: CONTENT.x + 0.22, y: cardY + 0.22, w: 0.36, h: 0.32,
      rectRadius: 0.06,
      fill: { color: C.navy },
      line: { color: acc, width: 0.8 }
    });
    addText(slide, `0${idx + 1}`, {
      x: CONTENT.x + 0.22, y: cardY + 0.29, w: 0.36, h: 0.16,
      fontSize: 8.5, bold: true, color: acc, align: 'center'
    });
    // Feature Title
    addText(slide, item.title, {
      x: CONTENT.x + 0.72, y: cardY + 0.16, w: CONTENT.w - 0.95, h: 0.24,
      fontSize: 12.5, bold: true, color: C.white
    });
    // Feature Description Body
    addText(slide, item.body, {
      x: CONTENT.x + 0.72, y: cardY + 0.44, w: CONTENT.w - 0.95, h: 0.44,
      fontSize: 10.2, color: C.subtle, breakLine: false
    });

    cardY += cardH + cardGap;
  });

  // Bottom "Why It Matters" Callout Container
  const whyY = 5.72;
  const whyH = 0.76;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: CONTENT.x, y: whyY, w: CONTENT.w, h: whyH,
    rectRadius: 0.08,
    fill: { color: C.gold },
    line: { color: C.gold }
  });
  addText(slide, 'OPERATIONAL VALUE', {
    x: CONTENT.x + 0.3, y: whyY + 0.14, w: 2.2, h: 0.16,
    fontSize: 7.5, bold: true, charSpacing: 1.4, color: C.navy
  });
  addText(slide, outcome, {
    x: CONTENT.x + 0.3, y: whyY + 0.34, w: CONTENT.w - 0.6, h: 0.34,
    fontSize: 11, bold: true, color: C.navy, breakLine: false
  });
}

function addInfoSlide(heading, kicker, intro, sections) {
  const slide = pptx.addSlide();
  addBase(slide, false);
  addTitle(slide, heading, kicker, false);
  addText(slide, intro, { x: 0.58, y: 1.42, w: 8.9, h: 0.4, fontSize: 15, color: C.ink });
  let x = 0.6;
  let y = 2.08;
  for (const section of sections) {
    addCard(slide, x, y, section.w ?? 3.85, section.h ?? 1.62, section.heading, section.body, false, section.accent ?? C.gold);
    x += (section.w ?? 3.85) + 0.28;
    if (x > 9.9) { x = 0.6; y += (section.h ?? 1.62) + 0.28; }
  }
}

function addIntegrationSlide() {
  const slide = pptx.addSlide();
  addBase(slide, true);
  addTitle(slide, 'Connected academy ecosystem', 'Integrations', true);
  addText(slide, 'The app is the mobile control layer. Existing services remain useful, but the coach gets one coherent workflow.', { x: 0.58, y: 1.4, w: 11.8, h: 0.38, fontSize: 14, color: 'D9E5EF' });
  const centerX = 5.03;
  const centerY = 2.55;
  slide.addShape(pptx.ShapeType.roundRect, { x: centerX, y: centerY, w: 3.25, h: 1.55, rectRadius: 0.12, fill: { color: C.gold }, line: { color: C.gold } });
  addText(slide, 'KAFT MOBILE APP', { x: centerX + 0.25, y: centerY + 0.35, w: 2.75, h: 0.25, fontSize: 16, bold: true, color: C.navy, align: 'center' });
  addText(slide, 'One workspace for people, classes, payments, events, and progress', { x: centerX + 0.35, y: centerY + 0.78, w: 2.55, h: 0.42, fontSize: 9.5, bold: true, color: C.navy, align: 'center' });
  const nodes = [
    { x: 0.75, y: 2.1, title: 'Google OAuth', body: 'Secure coach sign-in\nand identity context', color: C.blue },
    { x: 0.75, y: 4.35, title: 'Google Sheets', body: 'Live roster, attendance,\nfees, settings, events', color: C.green },
    { x: 9.35, y: 2.1, title: 'WhatsApp', body: 'Parent contact, group\ninvites, share-ready updates', color: C.coral },
    { x: 9.35, y: 4.35, title: 'Google Drive', body: 'Resources, PDFs, uploads,\nand shared documents', color: C.gold },
  ];
  for (const node of nodes) {
    slide.addShape(pptx.ShapeType.roundRect, { x: node.x, y: node.y, w: 3.0, h: 1.25, rectRadius: 0.08, fill: { color: C.navy2 }, line: { color: '31536E', width: 0.8 } });
    slide.addShape(pptx.ShapeType.rect, { x: node.x, y: node.y, w: 0.08, h: 1.25, fill: { color: node.color }, line: { color: node.color } });
    addText(slide, node.title, { x: node.x + 0.28, y: node.y + 0.22, w: 2.45, h: 0.22, fontSize: 13, bold: true, color: C.white, align: 'center' });
    addText(slide, node.body, { x: node.x + 0.28, y: node.y + 0.55, w: 2.45, h: 0.42, fontSize: 9.5, color: 'B9C9D8', align: 'center' });
    const startX = node.x < centerX ? node.x + 3.0 : centerX + 3.25;
    const endX = node.x < centerX ? centerX : node.x;
    slide.addShape(pptx.ShapeType.line, { x: startX, y: node.y + 0.62, w: endX - startX, h: centerY + 0.78 - (node.y + 0.62), line: { color: node.color, width: 1.4, beginArrowType: 'none', endArrowType: 'triangle' } });
  }
  addText(slide, 'CONNECTED BY LIVE STUDENT CONTEXT', { x: 4.42, y: 5.4, w: 4.5, h: 0.2, fontSize: 8, bold: true, charSpacing: 1.2, color: C.gold2, align: 'center' });
  addText(slide, 'No duplicate admin surface. The app gives each service a useful place in the academy day.', { x: 3.25, y: 5.78, w: 6.85, h: 0.42, fontSize: 12, color: 'D9E5EF', align: 'center' });
}

function addOnlineFlowSlide() {
  const slide = pptx.addSlide();
  addBase(slide, false);
  addTitle(slide, 'From student record to online insight', 'Smart data flow', false);
  addText(slide, 'A strong example of the app doing more than storing fields: it turns IDs into useful coaching context.', { x: 0.58, y: 1.4, w: 11.7, h: 0.35, fontSize: 14, color: C.ink });
  const steps = [
    ['01', 'Student roster', 'The app fetches the live student record and its saved online IDs.'],
    ['02', 'Chess.com + Lichess', 'Platform usernames remain linked to the correct student.'],
    ['03', 'Online stats', 'Ratings and monthly or weekly activity can be fetched for review.'],
    ['04', 'Academy action', 'Use the insight in tournaments, progress, reports, and WhatsApp updates.'],
  ];
  let x = 0.65;
  for (const [number, heading, body] of steps) {
    slide.addShape(pptx.ShapeType.roundRect, { x, y: 2.35, w: 2.82, h: 2.35, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.pale, width: 0.8 } });
    slide.addShape(pptx.ShapeType.ellipse, { x: x + 0.22, y: 2.62, w: 0.48, h: 0.48, fill: { color: C.navy }, line: { color: C.navy } });
    addText(slide, number, { x: x + 0.22, y: 2.79, w: 0.48, h: 0.1, fontSize: 8, bold: true, color: C.gold2, align: 'center' });
    addText(slide, heading, { x: x + 0.85, y: 2.69, w: 1.72, h: 0.24, fontSize: 13, bold: true, color: C.navy });
    addText(slide, body, { x: x + 0.25, y: 3.45, w: 2.3, h: 0.7, fontSize: 10.5, color: C.ink, align: 'center' });
    if (number !== '04') slide.addShape(pptx.ShapeType.chevron, { x: x + 2.9, y: 3.3, w: 0.38, h: 0.48, fill: { color: C.gold }, line: { color: C.gold } });
    x += 3.12;
  }
  slide.addShape(pptx.ShapeType.roundRect, { x: 1.35, y: 5.45, w: 10.6, h: 0.82, rectRadius: 0.06, fill: { color: C.mint }, line: { color: C.mint } });
  addText(slide, 'COOL FEATURE  |  Online identities are not isolated text fields. They become searchable, fetchable, matchable, and shareable academy data.', { x: 1.7, y: 5.75, w: 9.9, h: 0.18, fontSize: 10, bold: true, color: C.green, align: 'center' });
}

const screens = [
  ['dashboard', 'Dashboard', 'Daily control room', 'The first screen gives the coach a compact read on what needs attention today.', [['At-a-glance metrics', 'Attendance, fees, and academy activity in one place.'], ['Fast actions', 'Jump directly into the workflows that happen every day.'], ['Decision context', 'Use the dashboard as the morning starting point.']], 'Less time hunting for information.'],
  ['students', 'Students', 'Student records', 'The roster is the operational backbone: profiles, filters, IDs, schools, batches, and coaches.', [['Build a complete profile', 'Capture family details, academic information, ratings, and online IDs.'], ['Find the right student', 'Search and filter by batch, coach, school, status, or age category.'], ['Keep data current', 'Edit, archive, or review a student without leaving the mobile workflow.']], 'Every learner has one dependable record.'],
  ['attendance', 'Attendance', 'Class operations', 'Mark class participation against the exact date and keep the academy roster honest.', [['Select the class date', 'Move across dates without losing the active roster.'], ['Mark quickly', 'Use touch-friendly controls for the whole batch.'], ['Review the pattern', 'Attendance becomes useful when it is consistently captured.']], 'A reliable attendance habit creates useful progress data.'],
  ['fees', 'Fees', 'Finance', 'Track what is due, what was collected, and what still needs follow-up.', [['Record payments', 'Support paid, partial, and pending states.'], ['Use payment context', 'UPI QR support helps the coach complete collection on mobile.'], ['Reconcile confidently', 'Balances and monthly summaries expose what needs attention.']], 'Finance becomes a visible routine, not a spreadsheet chase.'],
  ['tournaments', 'Tournaments', 'Competition', 'Bring registrations, results, achievements, and rankings into the academy workflow.', [['Manage participation', 'Register students and track playing status.'], ['Record outcomes', 'Capture results and connect them to student history.'], ['Celebrate progress', 'Leaderboards and achievements make improvement visible.']], 'Competition data becomes part of the student story.'],
  ['upcoming-tournaments', 'Upcoming tournaments', 'Planning', 'Keep external events visible before they become last-minute messages.', [['Event essentials', 'Dates, venues, entry fees, eligibility, and links.'], ['Deadline awareness', 'Registration deadlines are visible to the team.'], ['One shared view', 'Coaches can plan student participation from the same screen.']], 'The academy can plan ahead with fewer surprises.'],
  ['timetable', 'Timetable', 'Scheduling', 'A weekly view of batches, coaches, times, and locations.', [['Know the week', 'See what class is happening and when.'], ['Coordinate people', 'Connect each batch to its coach and location.'], ['Support parents', 'Use the same schedule context when answering questions.']], 'A shared timetable reduces coordination friction.'],
  ['resources', 'Resources', 'Academy library', 'Give the coaching team a single place to find supporting material.', [['Open useful material', 'Links and documents are available from the app.'], ['Add context', 'Descriptions and levels make resources easier to choose.'], ['Keep knowledge reusable', 'Good coaching material does not disappear in chat threads.']], 'The academy builds a reusable teaching library.'],
  ['curriculum', 'Curriculum', 'Learning plan', 'Turn coaching intent into a progression that can be revisited.', [['Progressive topics', 'Move from foundational skills toward stronger play.'], ['Level awareness', 'Match content to the learner level.'], ['Coach alignment', 'Give the team a shared teaching reference.']], 'Lessons become part of a consistent academy method.'],
  ['admin-settings', 'Admin settings', 'Configuration', 'Configure the lists that power the student workflow and synchronize changes to existing records.', [['Manage vocabulary', 'Batches, coaches, and school values stay controlled.'], ['Apply changes safely', 'Renamed schools and assignments update existing students.'], ['Reduce repetition', 'Configure once, reuse across the app.']], 'The system stays consistent as the academy grows.'],
  ['online-chess', 'Online chess', 'Online play', 'Keep platform identities connected to the student roster.', [['Track IDs', 'Chess.com and Lichess usernames live with the student profile.'], ['Search by context', 'Use school, batch, and other filters to find players.'], ['Respect real usernames', 'Special characters and platform naming conventions are supported.']], 'Online activity becomes easier to include in coaching.'],
  ['mini-tournament', 'Pairing', 'Live tournament tool', 'Run a small tournament session without leaving the academy app.', [['Create a session', 'Set up a compact event for the current group.'], ['Pair rounds', 'Generate the next round from the active results.'], ['Record the result', 'Keep the session history for later reference.']], 'A live event can run from one focused mobile screen.'],
  ['operations-center', 'Operations center', 'Academy controls', 'A control surface for operational switches and recurring tasks.', [['Control features', 'Turn optional workflows on or off.'], ['Protect consistency', 'Keep operational behavior visible to the team.'], ['Act quickly', 'Use a focused page for admin actions.']], 'Less hidden configuration, more operational clarity.'],
  ['student-timeline', 'Student timeline', 'Student insight', 'See the learner journey as a connected sequence of activity.', [['Read the story', 'Attendance, progress, and events sit in chronological context.'], ['Start from a student', 'Open a timeline for the learner you are discussing.'], ['Coach with evidence', 'Use history to guide the next conversation.']], 'A profile becomes a story, not just a row.'],
  ['monthly-report', 'Monthly report', 'Reporting', 'Turn the month into a shareable summary for review and communication.', [['Summarize performance', 'Bring together useful monthly signals.'], ['Export when needed', 'Create a report that can leave the app.'], ['Create a rhythm', 'Monthly review supports steady academy improvement.']], 'Reporting becomes a recurring management habit.'],
  ['student-progress', 'Student progress', 'Performance', 'Combine attendance, skills, ratings, and insights around one learner.', [['Choose the learner', 'Navigate from the roster into focused progress.'], ['Compare signals', 'Read performance with context instead of one isolated number.'], ['Take action', 'Use the view to decide what to coach next.']], 'Better coaching starts with better context.'],
  ['more', 'More', 'Navigation hub', 'A mobile-friendly home for secondary screens and utilities.', [['Keep primary navigation clean', 'Frequent actions stay easy to reach.'], ['Discover the rest', 'Less frequent tools still have a clear home.'], ['Stay touch-friendly', 'The mobile menu keeps the product approachable.']], 'A large product stays navigable on a small screen.'],
  ['parent-portal', 'Parent portal', 'Parent experience', 'A focused view for families who need clarity without the full admin surface.', [['See student context', 'Parents get the information relevant to their learner.'], ['Make progress visible', 'Share useful updates in a simpler format.'], ['Reduce back-and-forth', 'The portal supports more informed conversations.']], 'Families stay connected without learning the whole system.'],
];

const cover = pptx.addSlide();
addBase(cover, true);
cover.addShape(pptx.ShapeType.rect, { x: 7.95, y: 0, w: 5.383, h: 7.5, fill: { color: C.navy2 }, line: { color: C.navy2 } });
addText(cover, 'KAFT CHESS\nACADEMY', { x: 0.72, y: 1.0, w: 6.4, h: 1.35, fontFace: 'Aptos Display', fontSize: 38, bold: true, color: C.white });
addText(cover, 'MOBILE APP\nWALKTHROUGH', { x: 0.76, y: 2.72, w: 5.5, h: 0.9, fontSize: 19, bold: true, color: C.gold2, charSpacing: 1.2 });
addText(cover, 'Screens, workflows, and features explained through the people who use them.', { x: 0.76, y: 4.02, w: 5.3, h: 0.75, fontSize: 15, color: 'D9E5EF' });
cover.addShape(pptx.ShapeType.roundRect, { x: 0.76, y: 5.63, w: 5.48, h: 0.74, rectRadius: 0.06, fill: { color: C.gold }, line: { color: C.gold } });
addText(cover, '18 MOBILE SCREENS  |  24 SLIDES  |  1 ACADEMY WORKSPACE', { x: 1.0, y: 5.91, w: 5.0, h: 0.16, fontSize: 8.5, bold: true, color: C.navy, align: 'center', charSpacing: 0.4 });
const coverPhone = {
  x: 8.95,
  y: 0.95,
  w: PHONE.w,
  h: PHONE.h,
  pad: PHONE.pad,
  imgW: PHONE.imgW,
  imgH: PHONE.imgH
};
addPhone(cover, 'dashboard', coverPhone);
addText(cover, 'Prepared 09 September 2026', { x: 0.76, y: 6.82, w: 3.0, h: 0.15, fontSize: 8, color: 'AFC1D4' });

addInfoSlide('The academy operating loop', 'How it fits together', 'The app connects the recurring work of running a chess academy into one mobile routine.', [
  { heading: 'Run the day', body: 'Dashboard -> Students -> Attendance -> Fees\n\nThe daily operating loop keeps people, classes, and collections visible.', w: 3.85, h: 2.0, accent: C.gold },
  { heading: 'Grow the players', body: 'Curriculum -> Resources -> Progress -> Timeline\n\nTeaching activity and learner evidence stay connected.', w: 3.85, h: 2.0, accent: C.green },
  { heading: 'Run the academy', body: 'Tournaments -> Reports -> Operations -> Admin settings\n\nEvents, decisions, and configuration have a clear home.', w: 3.85, h: 2.0, accent: C.coral },
  { heading: 'Keep families informed', body: 'Parent portal\n\nA focused experience for the people who need student context without the full admin surface.', w: 3.85, h: 1.72, accent: C.blue },
]);

addInfoSlide('A simple demo story', 'Recommended walkthrough', 'Show the product in the order the academy experiences it, not in the order the menu happens to list it.', [
  { heading: '01  Start with today', body: 'Open the dashboard and answer: what needs attention now?', w: 3.85, h: 1.6 },
  { heading: '02  Follow one learner', body: 'Open a student, mark attendance, review fees, and inspect progress.', w: 3.85, h: 1.6, accent: C.green },
  { heading: '03  Show the academy', body: 'Move through timetable, tournaments, resources, and curriculum.', w: 3.85, h: 1.6, accent: C.blue },
  { heading: '04  Close the loop', body: 'Finish with reports, settings, operations, and the parent portal.', w: 3.85, h: 1.6, accent: C.coral },
]);

addIntegrationSlide();
addOnlineFlowSlide();

screens.forEach(([name, heading, kicker, description, points, outcome], index) => {
  addScreenSlide(
    { name, heading, kicker, description, points: points.map(([title, body]) => ({ title, body })), outcome },
    index + 1,
    screens.length
  );
});

addInfoSlide('The data layer behind the experience', 'What powers the screens', 'The app keeps the interface friendly while preserving the academy data in tools the team already understands.', [
  { heading: 'Google Sheets', body: 'Students, attendance, fees, settings, tournaments, timetable, and reports use structured sheet tabs as the operational source.', w: 3.85, h: 1.85, accent: C.green },
  { heading: 'Google Drive', body: 'Resources and uploaded documents can be connected to Drive for shared access and retrieval.', w: 3.85, h: 1.85, accent: C.blue },
  { heading: 'Mobile PWA', body: 'Responsive layouts, installable behavior, and touch-sized controls support the coach on the move.', w: 3.85, h: 1.85, accent: C.gold },
  { heading: 'Connected decisions', body: 'The value is not one isolated screen. It is the connection between roster, classes, payments, events, and progress.', w: 3.85, h: 1.85, accent: C.coral },
]);

for (const slide of pptx._slides ?? []) slide.addNotes('Use the screenshot slides as a visual tour. Screens were captured in the mobile test environment using fixture data, not private production records.');

await pptx.writeFile({ fileName: output });
const zip = await JSZip.loadAsync(fs.readFileSync(output));
for (const file of Object.keys(zip.files).filter(item => /^ppt\/slides\/slide\d+\.xml$/.test(item))) {
  let xml = await zip.file(file).async('string');
  if (!xml.includes('<p:transition')) {
    const transition = '<p:transition spd="slow"><p:fade/></p:transition>';
    xml = xml.includes('<p:timing') ? xml.replace('<p:timing', `${transition}<p:timing`) : xml.replace('</p:sld>', `${transition}</p:sld>`);
    zip.file(file, xml);
  }
}
fs.writeFileSync(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`Created ${output} with fade transitions`);