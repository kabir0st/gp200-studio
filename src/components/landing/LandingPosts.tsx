interface Post {
  href: string;
  /** Two-digit part number; the posts are a numbered series. */
  part: string;
  title: string;
  blurb: string;
  readTime: string;
}

/** The two write-ups behind this app, on the author's own site. External, so
 *  they open in a new tab rather than dropping a connected device's session. */
const POSTS: Post[] = [
  {
    href: 'https://kabirtamari.com/blogs/building-gp200-studio',
    part: '01',
    title: 'My Guitar Pedal Refused to Talk to Linux',
    blurb:
      'Valeton never shipped a Linux editor, so the GP-200 got a new one in the browser: Web MIDI, 305 effects, 278 generated pedal artworks and no server at all.',
    readTime: '7 min read',
  },
  {
    href: 'https://kabirtamari.com/blogs/reverse-engineering-gp200',
    part: '02',
    title: 'Wireshark, Ghidra and My Guitar Pedal’s Secrets',
    blurb:
      'Working out the GP-200’s undocumented SysEx dialect: USB traffic captured in Wireshark, the official Windows editor decompiled in Ghidra, one misread byte at a time.',
    readTime: '8 min read',
  },
];

/** The story of the app, one step out from the app itself. Real anchors in the
 *  prerendered markup, so they are crawlable edges out to the write-ups rather
 *  than JavaScript-only clicks. */
export function LandingPosts() {
  return (
    <section className="lp-band lp-section lp-posts tint" aria-labelledby="lp-posts-title">
      <div className="lp-section-head lp-reveal">
        <h2 id="lp-posts-title" className="lp-h2">Build log</h2>
        <p className="lp-section-sub">How it was reverse-engineered, on kabirtamari.com.</p>
      </div>
      <ol className="lp-post-list">
        {POSTS.map((post) => (
          <li key={post.href} className="lp-reveal">
            <a className="lp-post" href={post.href} target="_blank" rel="noopener noreferrer">
              <span className="lp-post-part" aria-hidden="true">{post.part}</span>
              <span className="lp-post-body">
                <span className="lp-post-title">{post.title}</span>
                <span className="lp-post-blurb">{post.blurb}</span>
                <span className="lp-post-meta">
                  <span>{post.readTime}</span>
                  <span className="lp-post-arrow" aria-hidden="true">&#8599;</span>
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
