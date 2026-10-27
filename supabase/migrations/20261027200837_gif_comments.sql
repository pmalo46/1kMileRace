-- A comment can carry a GIF from GIPHY, with or without words.
--
-- Only GIPHY's own media hosts are accepted, so a comment can't be made to load an image
-- from anywhere else. The size is kept so the app can lay a GIF out before it loads.

alter table comments drop constraint comments_body_check;

alter table comments
  add column gif_id text check (char_length(gif_id) between 1 and 100),
  add column gif_url text check (gif_url ~ '^https://media[0-9]*\.giphy\.com/' and char_length(gif_url) <= 500),
  add column gif_width integer check (gif_width > 0),
  add column gif_height integer check (gif_height > 0),
  add constraint comments_body_check check (char_length(body) <= 1000),
  add constraint comments_gif_complete check (num_nulls(gif_id, gif_url, gif_width, gif_height) in (0, 4)),
  add constraint comments_not_empty check (char_length(body) >= 1 or gif_url is not null);
