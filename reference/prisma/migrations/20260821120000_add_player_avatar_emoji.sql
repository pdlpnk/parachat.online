ALTER TABLE "User"
ADD COLUMN "avatarEmoji" VARCHAR(32);

WITH avatar_pool AS (
  SELECT ARRAY[
    '🐼','🦊','🦁','🐸','🦄','🤖','👾','👻','🧙','🧑‍🚀','🦋','🐙','🦜','🐯','🐨','🐵','🐶','🐱','🐭','🐹',
    '🐰','🐻','🐻‍❄️','🐮','🐷','🐽','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🫎','🐝','🪲',
    '🐞','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐳','🐬','🦭','🐟','🐠','🐡','🦈','🐊','🐅','🐆','🦓',
    '🦍','🦧','🦣','🐘','🦛','🦏','🐪','🦒','🦘','🦬','🦙','🐐','🦌','🐕','🐩','🐈','🐓','🦃','🦚','🦩',
    '🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐿️','🦔','🐉','🐲','🌵','🌴','🌲','🌳','🌱','🍀','🌻',
    '🌺','🌸','🌼','🌷','🪷','🍄','🌙','🌞','⭐','🌈','☄️','🪐','🌍','🚀','🛸','🛰️','🔭','🗿','🏰','⛵',
    '🚁','🚂','🏎️','🚲','🎈','🪁','🎨','🎭','🎸','🎷','🥁','🎻','🎲','🧩','🪀','🛹','🏄','🧗','🥑','🍉',
    '🍓','🍒','🍋','🍍','🥝','🥕','🌽','🍄‍🟫','🥐','🧁','🍪','🍩','🍿','🧋','☕','🫖','💎','🔮','🪄','🧸'
  ]::TEXT[] AS emojis
), player_numbers AS (
  SELECT
    u.id,
    substring(u."vxId" FROM 3)::INTEGER AS ordinal,
    avatar_pool.emojis,
    array_length(avatar_pool.emojis, 1) AS pool_size
  FROM "User" u
  INNER JOIN "UserProfile" profile ON profile."userId" = u.id
  CROSS JOIN avatar_pool
  WHERE profile."productRole" = 'PLAYER'
)
UPDATE "User" target
SET "avatarEmoji" = CASE
  WHEN player.ordinal <= player.pool_size THEN player.emojis[player.ordinal]
  ELSE
    player.emojis[((player.ordinal - player.pool_size - 1) / player.pool_size) % player.pool_size + 1]
    || player.emojis[(player.ordinal - player.pool_size - 1) % player.pool_size + 1]
END
FROM player_numbers player
WHERE target.id = player.id
  AND target."avatarEmoji" IS NULL;

CREATE UNIQUE INDEX "User_avatarEmoji_key" ON "User"("avatarEmoji");
