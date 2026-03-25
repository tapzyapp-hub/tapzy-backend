-- CreateTable
CREATE TABLE "ActivationCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "deactivationReason" TEXT,
    "profileId" TEXT,

    CONSTRAINT "ActivationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "editSecret" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "bio" TEXT,
    "photo" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "linkedin" TEXT,
    "tiktok" TEXT,
    "twitter" TEXT,
    "facebook" TEXT,
    "youtube" TEXT,
    "github" TEXT,
    "snapchat" TEXT,
    "whatsapp" TEXT,
    "telegram" TEXT,
    "connections" INTEGER NOT NULL DEFAULT 0,
    "quickShareEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareNameEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sharePhoneEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareWebsiteEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareInstagramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareLinkedinEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareTiktokEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareTwitterEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareFacebookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareYoutubeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareGithubEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareSnapchatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareWhatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shareTelegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userAccountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userAccountId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "senderProfileId" TEXT NOT NULL,
    "receiverProfileId" TEXT NOT NULL,
    "sharedName" TEXT,
    "sharedPhone" TEXT,
    "sharedEmail" TEXT,
    "sharedWebsite" TEXT,
    "sharedInstagram" TEXT,
    "sharedLinkedin" TEXT,
    "sharedTiktok" TEXT,
    "sharedTwitter" TEXT,
    "sharedFacebook" TEXT,
    "sharedYoutube" TEXT,
    "sharedGithub" TEXT,
    "sharedSnapchat" TEXT,
    "sharedWhatsapp" TEXT,
    "sharedTelegram" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TapMoment" (
    "id" TEXT NOT NULL,
    "senderProfileId" TEXT NOT NULL,
    "receiverProfileId" TEXT NOT NULL,
    "eventName" TEXT,
    "location" TEXT,
    "note" TEXT,
    "snapshotUrl" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TapMoment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TapMomentLike" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TapMomentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerProfileId" TEXT NOT NULL,
    "followingProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderProfileId" TEXT NOT NULL,
    "body" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoCallRoom" (
    "id" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "conversationId" TEXT,
    "createdByProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoCallRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairRoom" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdByProfileId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PairRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairParticipant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "selectedFields" JSONB,

    CONSTRAINT "PairParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventFinderItem" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "venueName" TEXT,
    "address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "eventUrl" TEXT,
    "ticketUrl" TEXT,
    "category" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "priceText" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventFinderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedEvent" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestedEvent" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterestedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivationCode_code_key" ON "ActivationCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ActivationCode_publicToken_key" ON "ActivationCode"("publicToken");

-- CreateIndex
CREATE INDEX "activation_profileId_idx" ON "ActivationCode"("profileId");

-- CreateIndex
CREATE INDEX "activation_isActive_createdAt_idx" ON "ActivationCode"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "activation_claimedAt_idx" ON "ActivationCode"("claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_username_key" ON "UserProfile"("username");

-- CreateIndex
CREATE INDEX "userprofile_createdAt_idx" ON "UserProfile"("createdAt");

-- CreateIndex
CREATE INDEX "userprofile_connections_idx" ON "UserProfile"("connections");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_email_key" ON "UserAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_profileId_key" ON "UserAccount"("profileId");

-- CreateIndex
CREATE INDEX "useraccount_createdAt_idx" ON "UserAccount"("createdAt");

-- CreateIndex
CREATE INDEX "useraccount_emailVerified_idx" ON "UserAccount"("emailVerified");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_token_key" ON "UserSession"("token");

-- CreateIndex
CREATE INDEX "usersession_userAccountId_idx" ON "UserSession"("userAccountId");

-- CreateIndex
CREATE INDEX "usersession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "usersession_userAccountId_expiresAt_idx" ON "UserSession"("userAccountId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_token_key" ON "MagicLinkToken"("token");

-- CreateIndex
CREATE INDEX "magiclink_email_idx" ON "MagicLinkToken"("email");

-- CreateIndex
CREATE INDEX "magiclink_userAccountId_idx" ON "MagicLinkToken"("userAccountId");

-- CreateIndex
CREATE INDEX "magiclink_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "magiclink_usedAt_idx" ON "MagicLinkToken"("usedAt");

-- CreateIndex
CREATE INDEX "connection_sender_createdAt_idx" ON "Connection"("senderProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "connection_receiver_createdAt_idx" ON "Connection"("receiverProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "connection_createdAt_idx" ON "Connection"("createdAt");

-- CreateIndex
CREATE INDEX "tapmoment_sender_createdAt_idx" ON "TapMoment"("senderProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "tapmoment_receiver_createdAt_idx" ON "TapMoment"("receiverProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "tapmoment_createdAt_idx" ON "TapMoment"("createdAt");

-- CreateIndex
CREATE INDEX "tapmomentlike_profileId_idx" ON "TapMomentLike"("profileId");

-- CreateIndex
CREATE INDEX "tapmomentlike_momentId_idx" ON "TapMomentLike"("momentId");

-- CreateIndex
CREATE INDEX "tapmomentlike_createdAt_idx" ON "TapMomentLike"("createdAt");

-- CreateIndex
CREATE INDEX "tapmomentlike_momentId_createdAt_idx" ON "TapMomentLike"("momentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "tapmomentlike_profileId_momentId_key" ON "TapMomentLike"("profileId", "momentId");

-- CreateIndex
CREATE INDEX "follow_follower_createdAt_idx" ON "Follow"("followerProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "follow_following_createdAt_idx" ON "Follow"("followingProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "follow_createdAt_idx" ON "Follow"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerProfileId_followingProfileId_key" ON "Follow"("followerProfileId", "followingProfileId");

-- CreateIndex
CREATE INDEX "conversation_createdAt_idx" ON "Conversation"("createdAt");

-- CreateIndex
CREATE INDEX "conversation_updatedAt_idx" ON "Conversation"("updatedAt");

-- CreateIndex
CREATE INDEX "conversationmember_profileId_idx" ON "ConversationMember"("profileId");

-- CreateIndex
CREATE INDEX "conversationmember_conversationId_idx" ON "ConversationMember"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "conversationmember_conversationId_profileId_key" ON "ConversationMember"("conversationId", "profileId");

-- CreateIndex
CREATE INDEX "directmessage_conversationId_createdAt_idx" ON "DirectMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "directmessage_senderProfileId_idx" ON "DirectMessage"("senderProfileId");

-- CreateIndex
CREATE INDEX "directmessage_createdAt_idx" ON "DirectMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoCallRoom_roomName_key" ON "VideoCallRoom"("roomName");

-- CreateIndex
CREATE INDEX "videocallroom_conversationId_idx" ON "VideoCallRoom"("conversationId");

-- CreateIndex
CREATE INDEX "videocallroom_createdByProfileId_idx" ON "VideoCallRoom"("createdByProfileId");

-- CreateIndex
CREATE INDEX "videocallroom_createdAt_idx" ON "VideoCallRoom"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PairRoom_code_key" ON "PairRoom"("code");

-- CreateIndex
CREATE INDEX "pairroom_createdByProfileId_idx" ON "PairRoom"("createdByProfileId");

-- CreateIndex
CREATE INDEX "pairroom_status_idx" ON "PairRoom"("status");

-- CreateIndex
CREATE INDEX "pairroom_expiresAt_idx" ON "PairRoom"("expiresAt");

-- CreateIndex
CREATE INDEX "pairroom_createdAt_idx" ON "PairRoom"("createdAt");

-- CreateIndex
CREATE INDEX "pairparticipant_roomId_idx" ON "PairParticipant"("roomId");

-- CreateIndex
CREATE INDEX "pairparticipant_profileId_idx" ON "PairParticipant"("profileId");

-- CreateIndex
CREATE INDEX "pairparticipant_joinedAt_idx" ON "PairParticipant"("joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pairparticipant_roomId_profileId_key" ON "PairParticipant"("roomId", "profileId");

-- CreateIndex
CREATE INDEX "eventfinderitem_startAt_idx" ON "EventFinderItem"("startAt");

-- CreateIndex
CREATE INDEX "eventfinderitem_city_idx" ON "EventFinderItem"("city");

-- CreateIndex
CREATE INDEX "eventfinderitem_category_idx" ON "EventFinderItem"("category");

-- CreateIndex
CREATE INDEX "eventfinderitem_createdAt_idx" ON "EventFinderItem"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "eventfinderitem_source_sourceEventId_key" ON "EventFinderItem"("source", "sourceEventId");

-- CreateIndex
CREATE INDEX "savedevent_profileId_idx" ON "SavedEvent"("profileId");

-- CreateIndex
CREATE INDEX "savedevent_eventId_idx" ON "SavedEvent"("eventId");

-- CreateIndex
CREATE INDEX "savedevent_createdAt_idx" ON "SavedEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "savedevent_profileId_eventId_key" ON "SavedEvent"("profileId", "eventId");

-- CreateIndex
CREATE INDEX "interestedevent_profileId_idx" ON "InterestedEvent"("profileId");

-- CreateIndex
CREATE INDEX "interestedevent_eventId_idx" ON "InterestedEvent"("eventId");

-- CreateIndex
CREATE INDEX "interestedevent_createdAt_idx" ON "InterestedEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "interestedevent_profileId_eventId_key" ON "InterestedEvent"("profileId", "eventId");

-- AddForeignKey
ALTER TABLE "ActivationCode" ADD CONSTRAINT "ActivationCode_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "UserAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MagicLinkToken" ADD CONSTRAINT "MagicLinkToken_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_senderProfileId_fkey" FOREIGN KEY ("senderProfileId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_receiverProfileId_fkey" FOREIGN KEY ("receiverProfileId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapMoment" ADD CONSTRAINT "TapMoment_senderProfileId_fkey" FOREIGN KEY ("senderProfileId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapMoment" ADD CONSTRAINT "TapMoment_receiverProfileId_fkey" FOREIGN KEY ("receiverProfileId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapMomentLike" ADD CONSTRAINT "TapMomentLike_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TapMomentLike" ADD CONSTRAINT "TapMomentLike_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "TapMoment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerProfileId_fkey" FOREIGN KEY ("followerProfileId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingProfileId_fkey" FOREIGN KEY ("followingProfileId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMember" ADD CONSTRAINT "ConversationMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderProfileId_fkey" FOREIGN KEY ("senderProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCallRoom" ADD CONSTRAINT "VideoCallRoom_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCallRoom" ADD CONSTRAINT "VideoCallRoom_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairRoom" ADD CONSTRAINT "PairRoom_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairParticipant" ADD CONSTRAINT "PairParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "PairRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairParticipant" ADD CONSTRAINT "PairParticipant_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedEvent" ADD CONSTRAINT "SavedEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedEvent" ADD CONSTRAINT "SavedEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventFinderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestedEvent" ADD CONSTRAINT "InterestedEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestedEvent" ADD CONSTRAINT "InterestedEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventFinderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
