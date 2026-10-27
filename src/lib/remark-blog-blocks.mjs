// Remark plugin for blog-specific blocks.
//
// 1. Email templates: ```template [caption] fences render as a styled letter with a copy button.
//    Blank lines separate paragraphs; [Placeholders] are highlighted.
//
// 2. Guest experts: a heading like "Meet Our Guest Expert: Joy!" followed by bio paragraph(s)
//    and a portrait image becomes a compact card (small round portrait, name, bio)
//    instead of a full-width photo.

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const html = (value) => ({ type: 'html', value });
const textOf = (node) => (node.value ?? '') + (node.children ?? []).map(textOf).join('');

function renderTemplate(text, caption) {
  const paragraphs = text
    .trim()
    .split(/\n\s*\n+/)
    .map((p) =>
      escape(p.trim())
        .replace(/\[([^\]]+)\]/g, '<span class="tpl-slot">[$1]</span>')
        .replace(/\n/g, '<br>'),
    )
    .map((p) => `<p>${p}</p>`)
    .join('');
  return `<figure class="email-template"><figcaption><span>${escape(caption)}</span><button type="button" class="tpl-copy" data-copy-template>Copy</button></figcaption><div class="tpl-body">${paragraphs}</div></figure>`;
}

const isImageParagraph = (n) => n?.type === 'paragraph' && n.children.length === 1 && n.children[0].type === 'image';

/** Finds the guest's full name: first bold phrase in the bio, else the heading's first name plus a capitalized surname. */
function guestName(heading, bio) {
  const first = textOf(heading).split(':').pop().replace(/[!.*]/g, '').trim();
  for (const p of bio) {
    const strong = p.children.find((c) => c.type === 'strong');
    if (strong) return textOf(strong).trim();
    const m = textOf(p).match(new RegExp(`\\b${first}\\s+[A-Z][\\p{L}'-]+`, 'u'));
    if (m) return m[0];
  }
  return first;
}

function transformGuests(parent) {
  const out = [];
  const kids = parent.children;
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i];
    if (node.type === 'heading' && /guest expert/i.test(textOf(node))) {
      // Collect bio paragraphs and the portrait until the section ends.
      let j = i + 1;
      const bio = [];
      let photo;
      while (j < kids.length && !['heading', 'thematicBreak'].includes(kids[j].type) && (bio.length < 3 || !photo)) {
        if (isImageParagraph(kids[j]) && !photo) photo = kids[j];
        else if (kids[j].type === 'paragraph' && !/^\s*q:/i.test(textOf(kids[j]))) bio.push(kids[j]);
        else break;
        j++;
      }
      if (photo && bio.length) {
        const name = guestName(node, bio);
        photo.children[0].alt ||= name;
        out.push(
          html('<aside class="guest-card"><div class="guest-photo">'),
          photo,
          html(`</div><div class="guest-body"><p class="guest-label">Guest expert</p><p class="guest-name">${escape(name)}</p>`),
          ...bio,
          html('</div></aside>'),
        );
        i = j - 1;
        continue;
      }
    }
    out.push(node);
  }
  parent.children = out;
}

export default function remarkBlogBlocks() {
  const walk = (node) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      if (child.type === 'code' && child.lang === 'template') return html(renderTemplate(child.value, child.meta?.trim() || 'Email template'));
      walk(child);
      return child;
    });
  };
  return (tree) => {
    walk(tree);
    transformGuests(tree);
  };
}
