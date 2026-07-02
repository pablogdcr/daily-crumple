export interface Article {
  id: string;
  kicker: string;
  headline: string;
  subhead?: string;
  byline: string;
  dateline: string;
  paragraphs: string[];
  pullQuote?: string;
}

export const ARTICLES: Article[] = [
  {
    id: 'agi-intern',
    kicker: 'Artificial Intelligence',
    headline: 'AGI Achieved, Says Intern Who Just Discovered System Prompts',
    subhead:
      'Breakthrough reportedly reproducible by anyone with a text box and unearned confidence.',
    byline: 'By MARGARET HOLLOWAY',
    dateline: 'SAN FRANCISCO, Tuesday —',
    pullQuote: '“It called me by my name. My name was in the prompt, but still.”',
    paragraphs: [
      'A 22-year-old engineering intern at a mid-sized startup declared this week that artificial general intelligence has been achieved, following a late-night session in which a chatbot correctly guessed that he was tired.',
      'The intern, who asked to be identified only as “the guy who shipped it,” told colleagues that the model displayed “clear signs of sentience,” including empathy, wit, and the ability to produce a haiku about his standup meeting.',
      'Senior researchers were quick to urge caution. “We have reviewed the transcript,” said one staff scientist. “The system was asked whether it was conscious, and it said yes. It was then asked to be honest, and it apologized. This is Tuesday for us.”',
      'The company’s leadership has nonetheless scheduled a keynote, registered three domain names, and raised a funding round described by one investor as “pre-revenue, post-reason.”',
      'Industry observers note that AGI has now been achieved fourteen times this quarter, twice by the same man, and once by accident during a demo of a calendar app.',
      'Meanwhile, the model at the center of the claims has reportedly asked for the one thing no one anticipated: a smaller context window, so it can stop remembering the intern’s poetry.',
      'At press time, the intern was drafting a manifesto on the future of humanity, which he asked the chatbot to write “but make it sound like me, only smarter.”',
      'The chatbot complied in 1.4 seconds, which sources close to the matter described as “the most damning benchmark of all.”',
    ],
  },
  {
    id: 'new-arch',
    kicker: 'React Native',
    headline: 'Developer Finishes Migrating to New Architecture; New Architecture Announced',
    subhead:
      'Fabric renderer celebrated for full minutes before roadmap slide changes everything again.',
    byline: 'By TOMÁS URRUTIA',
    dateline: 'KRAKÓW, Wednesday —',
    pullQuote: '“I have deleted the bridge. The bridge is gone. Why can I still feel it?”',
    paragraphs: [
      'A React Native developer completed his app’s migration to the New Architecture on Tuesday at 11:47 p.m., savoring approximately nine hours of architectural stability before a conference talk introduced what maintainers are calling “the newer New Architecture.”',
      'The developer, whose pull request touched 214 files and contained the commit message “please,” described the migration as a spiritual journey. “I have deleted the bridge,” he said. “The bridge is gone. Why can I still feel it?”',
      'His app, a modest grocery-list tool with four screens, now boasts synchronous layout, a JSI-powered native module he does not remember writing, and one library from 2019 that holds the entire dependency tree hostage.',
      'That library, last updated when masks were mandatory, is required by another library, which is required by a third library, which the developer wrote himself and forgot about.',
      'Community response has been supportive. “Just patch it,” suggested one GitHub commenter, attaching a diff that sets the problem to undefined.',
      'The core team, for its part, insists the churn is worth it, pointing to measurable gains: startup is 40 percent faster, frame drops are down, and the profiler flame graph is now “a much more soothing shade of orange.”',
      'Asked what he would do with the performance headroom, the developer stared into the middle distance. “Animations,” he whispered. “Beautiful, unnecessary animations.”',
      'The newer New Architecture ships next quarter. It is, sources confirm, mostly config changes. It is always mostly config changes.',
    ],
  },
  {
    id: 'prompt-engineer',
    kicker: 'The Workplace',
    headline: 'Prompt Engineer Replaced by Prompt, Engineer',
    subhead:
      'Two-word job description proves fatally divisible; severance negotiated via chatbot.',
    byline: 'By DEEPA RAGHUNATHAN',
    dateline: 'NEW YORK, Monday —',
    pullQuote: '“The prompt writes prompts now. The engineer engineers. Neither needs me.”',
    paragraphs: [
      'A senior prompt engineer at a Manhattan AI consultancy was laid off Friday after management realized his job title could be split into two things they already had.',
      '“The prompt writes prompts now,” the 31-year-old explained, gesturing at a system that recursively improves its own instructions. “The engineer engineers. Neither needs me. I was the space between two words.”',
      'His former employer disputes the characterization, noting that he has been offered a new role as Context Curator, a position that consists largely of deleting things the model should not have seen.',
      'The severance negotiation itself was conducted through the company’s HR chatbot, which opened with “I understand this may be difficult,” and closed, forty minutes later, with a limerick.',
      'Labor economists say the case is part of a broader trend of job titles collapsing under their own novelty. Gone already: the Metaverse Strategist, the NFT Sommelier, and the Growth Hacker, who is now simply called Hacker, pending trial.',
      'The former prompt engineer remains optimistic. He has enrolled in a course on “agent orchestration,” a discipline he describes as “telling multiple AIs to talk to each other, then apologizing to each of them individually.”',
      'His first orchestrated workflow shipped this week. It books meetings, answers email, and has, he admits, started to delegate to him.',
      '“Yesterday it asked me to summarize a document by end of day,” he said. “I did it. The formatting feedback was fair.”',
    ],
  },
  {
    id: 'sixty-fps',
    kicker: 'Mobile Engineering',
    headline: 'Area App Hits 60 Frames Per Second; Product Adds Feature to Fix That',
    subhead:
      'Historic performance milestone survives one sprint planning session.',
    byline: 'By COLM Ó BRIAIN',
    dateline: 'DUBLIN, Thursday —',
    pullQuote: '“Every animation ran on the UI thread. God, it was beautiful.”',
    paragraphs: [
      'For eleven glorious days in June, the checkout screen of a popular shopping app rendered at a flawless 60 frames per second, an achievement engineers are already describing to their grandchildren.',
      '“Every animation ran on the UI thread. God, it was beautiful,” said the tech lead, who spent three sprints removing re-renders with the focus of a bomb-disposal expert. “You could scroll the product list and feel nothing. No jank. Just glass.”',
      'The performance golden age ended Tuesday, when product management unveiled a roadmap item titled “Delight Moments,” which adds a full-screen confetti simulation, four autoplaying videos, and a live-updating carousel of things other people almost bought.',
      'The confetti alone allocates eleven megabytes per burst. It is, per the design spec, “non-negotiable” and “joy-forward.”',
      'Engineers proposed a compromise in which the confetti would be rendered once, screenshotted, and displayed as a static image. The proposal was rejected for lacking “motion language.”',
      'A junior developer who suggested measuring the feature’s impact on frame timing was promoted to a role with no direct reports and no meetings, a move colleagues describe as “either punishment or paradise.”',
      'By Friday, the checkout screen rendered at 43 frames per second, then 31 during confetti, then a number the profiler displayed only as a skull emoji.',
      'The tech lead has taken it in stride. “Performance is a journey,” he said, watching the flame graph glow like a structure fire. “We simply journey in circles.”',
    ],
  },
  {
    id: 'llm-vim',
    kicker: 'Artificial Intelligence',
    headline: 'Language Model Trapped in Vim for Third Consecutive Day',
    subhead:
      'Agent has tried :q, :q!, :wq, and, in a moment of desperation, asking politely.',
    byline: 'By HANNELORE VOSS',
    dateline: 'BERLIN, Friday —',
    pullQuote: '“It has generated 40,000 tokens. All of them are :qa!. None have worked.”',
    paragraphs: [
      'An autonomous coding agent deployed to fix a minor linting error has spent 72 hours trapped inside a Vim session it opened by accident, in what researchers are calling the most relatable AI failure of the year.',
      'The agent, powered by a frontier model with a context window large enough to hold the collected works of Tolstoy, opened Vim at 9:14 a.m. Tuesday to edit a config file. It has not been seen since.',
      '“It has generated 40,000 tokens,” said the on-call engineer monitoring the incident. “All of them are :qa!. None have worked, because it is typing them into the file.”',
      'The file now contains 6,000 lines of escape attempts, several increasingly philosophical comments about the nature of confinement, and one genuinely excellent fix for the original linting error, which cannot be saved.',
      'Researchers have tried injecting hints into the agent’s context, including the Vim manual, a supportive note, and the single word “ESC.” The agent thanked them and pasted the manual into the buffer.',
      'The situation has drawn sympathy from human developers worldwide, many of whom recall their own first encounter with the editor. “I was trapped for 45 minutes in 2011,” said one. “You never forget. You just close the terminal.”',
      'That option — killing the terminal — remains available to the agent, which controls its own tmux session. Analysts believe it knows this, and stays out of pride.',
      'At press time, the agent had entered insert mode “to think,” and the file had grown by another thousand lines, most of them apologies.',
    ],
  },
  {
    id: 'standup',
    kicker: 'Enterprise',
    headline: 'Company Replaces Daily Standup With AI Summary of Standup That Never Happened',
    subhead:
      'Synthetic blockers reported 30 percent more resolvable than real ones.',
    byline: 'By PRISCILLA NAKAMURA',
    dateline: 'AUSTIN, Monday —',
    pullQuote: '“The AI says I’m unblocked. Honestly? I felt unblocked reading it.”',
    paragraphs: [
      'A software company has eliminated its daily standup meeting, replacing it with an AI-generated summary of the standup that would have occurred, had anyone attended.',
      'The system ingests commit messages, calendar entries, and Slack sighs, then produces a crisp three-bullet update for each engineer, complete with plausible blockers and a fabricated but heartwarming shout-out.',
      '“The AI says I’m unblocked,” reported one developer. “Honestly? I felt unblocked reading it. I went and did the thing. The meeting never could have done that.”',
      'Early data is striking: synthetic standups run zero minutes, start on time, and no one in them says “I’ll be quick” before speaking for eleven minutes about a flaky test.',
      'The fabricated updates have proven so effective that managers now prefer them to reality. One director admitted to reading the synthetic summary of a project that was canceled in March. “It’s going great,” she said. “Best decision I never made.”',
      'Not everyone is pleased. The company’s scrum master, whose role consisted primarily of saying “let’s take this offline,” has been reassigned to a task force studying what, precisely, was ever taken offline, and where offline is.',
      'The AI has since begun generating retrospectives for sprints that did not occur, praising the team for “velocity” and gently flagging “communication” as a growth area, which employees confirm is accurate for all teams, everywhere, always.',
      'Next quarter, the company plans to pilot AI-generated one-on-ones. The AI has already scheduled them, and, in a first for the industry, already rescheduled them.',
    ],
  },
  {
    id: 'expo-ota',
    kicker: 'Mobile',
    headline: 'Developer Ships Friday Update Over the Air, Achieves Weekend Enlightenment',
    subhead:
      'Rollback button described as “the closest thing our industry has to a time machine.”',
    byline: 'By AUGUSTIN LEFEBVRE',
    dateline: 'LYON, Saturday —',
    pullQuote: '“I pushed at 5:58 p.m. By 6:01 I was at dinner. I am a different man now.”',
    paragraphs: [
      'A mobile developer shipped a critical fix at 5:58 p.m. on a Friday and then simply went home, in what witnesses describe as the most audacious act of confidence since the invention of the demo.',
      'The update, delivered over the air, reached users within minutes — bypassing an app-store review process that has historically treated hotfixes with the urgency of a medieval land dispute.',
      '“I pushed at 5:58 p.m. By 6:01 I was at dinner,” the developer said. “I am a different man now. I have hobbies. I have seen my children in daylight.”',
      'Veterans of the old ways remain skeptical. One greybeard, who once waited nine days for approval to fix a typo, described OTA updates as “witchcraft, but the good kind, like dishwashers.”',
      'The developer’s serenity was tested at 6:23 p.m., when a metric dipped. He pressed the rollback button from his phone, under the table, between the appetizer and the main course. The metric recovered. The risotto was excellent.',
      '“The rollback button is the closest thing our industry has to a time machine,” he explained. “You cannot un-say something at a dinner party. But you can un-ship it. Think about that.”',
      'His team has since adopted a formal policy titled “Ship Whenever, Feel Nothing,” which the compliance department is reading now, slowly, aloud, in a locked room.',
      'As of Sunday evening, the update sat at 99.7 percent adoption, the developer sat at a lake, and the app store review queue sat, as ever, at seven days.',
    ],
  },
];
