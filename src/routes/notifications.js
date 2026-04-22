const router = require("express").Router();
const prisma = require("../prisma");
const { markAllNotificationsRead, markNotificationRead, getUnreadNotificationCount } = require("../services/notificationService");
const { renderShell, renderTapzyAssistant, escapeHtml, formatPrettyLocal } = require("../utils");

router.get("/api/notifications/unread-count", async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;
    if (!currentProfile) return res.status(401).json({ ok: false, error: "Unauthorized" });
    const unreadCount = await getUnreadNotificationCount(currentProfile.id);
    return res.json({ ok: true, unreadCount });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Unread notifications error" });
  }
});

router.post("/notifications/read-all", async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;
    if (!currentProfile) return res.redirect("/auth");
    await markAllNotificationsRead(currentProfile.id);
    return res.redirect("/notifications");
  } catch (e) {
    console.error(e);
    return res.status(500).send("Notifications read-all error");
  }
});

router.post("/notifications/:id/read", async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;
    if (!currentProfile) return res.redirect("/auth");

    const id = String(req.params.id || "").trim();
    const notification = await prisma.notification.findFirst({
      where: { id, profileId: currentProfile.id },
      select: { id: true, link: true },
    });

    if (!notification) {
      return res.redirect("/notifications");
    }

    await markNotificationRead(notification.id, currentProfile.id);
    return res.redirect(String(notification.link || "/notifications"));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Notification read error");
  }
});

router.get("/notifications", async (req, res) => {
  try {
    const currentProfile = req.currentProfile || null;
    if (!currentProfile) {
      return res.redirect("/auth");
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { profileId: currentProfile.id },
        include: {
          actor: {
            select: {
              username: true,
              name: true,
              photo: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      getUnreadNotificationCount(currentProfile.id),
    ]);

    const cards = notifications.length
      ? notifications.map((item) => {
          const actorLabel = escapeHtml(item.actor?.name || item.actor?.username || "Tapzy member");
          const actorPhoto = String(item.image || item.actor?.photo || "").trim();
          const title = escapeHtml(item.title || "Notification");
          const body = escapeHtml(item.body || "");
          const meta = `${actorLabel} • ${escapeHtml(formatPrettyLocal(item.createdAt))}`;
          return `
            <form class="notif-card ${item.readAt ? "is-read" : "is-unread"}" method="POST" action="/notifications/${escapeHtml(item.id)}/read">
              <button class="notif-card-btn" type="submit">
                <div class="notif-avatar">
                  ${actorPhoto ? `<img src="${escapeHtml(actorPhoto)}" alt="${actorLabel}" />` : `<span>${actorLabel.charAt(0).toUpperCase()}</span>`}
                </div>
                <div class="notif-copy">
                  <div class="notif-title-row">
                    <div class="notif-title">${title}</div>
                    ${item.readAt ? "" : `<span class="notif-dot"></span>`}
                  </div>
                  ${body ? `<div class="notif-body">${body}</div>` : ""}
                  <div class="notif-meta">${meta}</div>
                </div>
              </button>
            </form>
          `;
        }).join("")
      : `
        <div class="notif-empty-card">
          <div class="notif-empty-icon">✓</div>
          <div class="notif-empty-title">All caught up</div>
          <div class="notif-empty-copy">New messages, follows, stories, and post activity will show up here.</div>
        </div>
      `;

    const body = `
      <div class="wrap notifications-wrap">
        <section class="notif-hero">
          <div>
            <div class="notif-kicker">Tapzy Social</div>
            <h1 class="notif-title-main">Notifications</h1>
            <div class="notif-sub">Your unified inbox for messages, events, follows, stories, and posts.</div>
          </div>
          <div class="notif-hero-actions">
            <div class="notif-badge">${unreadCount ? `${unreadCount} unread` : `All caught up`}</div>
            <form class="notif-mark-form" method="POST" action="/notifications/read-all">
              <button type="submit" class="notif-mark-btn">Mark all read</button>
            </form>
          </div>
        </section>

        <section class="notif-list">
          ${cards}
        </section>
      </div>

      <style>
        .notifications-wrap{max-width:900px;}
        .notif-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin:20px 0 18px;padding:22px;border-radius:28px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(18,21,30,.96),rgba(10,12,18,.98));box-shadow:0 24px 60px rgba(0,0,0,.34);}
        .notif-kicker{color:#8f93a3;text-transform:uppercase;letter-spacing:3px;font-size:12px;margin-bottom:8px;}
        .notif-title-main{margin:0 0 6px;font-size:34px;line-height:1.02;}
        .notif-sub{color:#9aa3b2;max-width:580px;line-height:1.55;}
        .notif-hero-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:nowrap;flex:0 0 auto;}
        .notif-mark-form{display:inline-flex;margin:0;flex:0 0 auto;}
        .notif-badge,.notif-mark-btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);white-space:nowrap;font-weight:800;color:#fff;line-height:1;text-decoration:none;}
        .notif-mark-btn{cursor:pointer;}
        .notif-list{display:grid;gap:14px;margin-bottom:26px;}
        .notif-card{margin:0;}
        .notif-card-btn{width:100%;display:flex;gap:14px;align-items:flex-start;text-decoration:none;color:inherit;padding:16px;border-radius:22px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(16,18,26,.96),rgba(8,10,16,.98));box-shadow:0 18px 42px rgba(0,0,0,.28);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;cursor:pointer;text-align:left;}
        .notif-card-btn:hover{transform:translateY(-2px);border-color:rgba(127,210,255,.22);box-shadow:0 22px 50px rgba(0,0,0,.34);}
        .notif-card.is-unread .notif-card-btn{border-color:rgba(127,210,255,.18);}
        .notif-card.is-read .notif-card-btn{opacity:.88;}
        .notif-avatar{width:48px;height:48px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;flex:0 0 auto;border:1px solid rgba(255,255,255,.1);}
        .notif-avatar img{width:100%;height:100%;object-fit:cover;}
        .notif-copy{min-width:0;flex:1;}
        .notif-title-row{display:flex;align-items:center;gap:8px;}
        .notif-title{font-weight:800;font-size:16px;margin-bottom:4px;}
        .notif-dot{width:10px;height:10px;border-radius:999px;background:#7fd2ff;box-shadow:0 0 18px rgba(127,210,255,.55);}
        .notif-body{color:#d7deea;line-height:1.45;}
        .notif-meta{margin-top:8px;color:#8f93a3;font-size:12px;}
        .notif-empty-card{padding:28px 24px;border-radius:24px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:#aab3c2;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;}
        .notif-empty-icon{width:44px;height:44px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:rgba(127,210,255,.10);border:1px solid rgba(127,210,255,.25);color:#fff;font-weight:900;}
        .notif-empty-title{color:#fff;font-size:20px;font-weight:800;}
        .notif-empty-copy{max-width:520px;line-height:1.6;}
        @media (max-width: 720px){
          .notif-hero{flex-direction:column;}
          .notif-title-main{font-size:28px;}
          .notif-hero-actions{width:100%;justify-content:flex-start;flex-wrap:wrap;}
        }
      </style>
    `;

    return res.send(renderShell("Notifications", body, "", {
      currentProfile,
      assistant: renderTapzyAssistant({
        pageType: "notifications",
        currentProfile,
        title: "Notifications",
      }),
    }));
  } catch (e) {
    console.error(e);
    return res.status(500).send("Notifications page error");
  }
});

module.exports = router;
