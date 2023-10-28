import wordfilter from "wordfilter";
import request from "request";
import rita from "rita"
import { createCanvas } from 'canvas'
import fs from "fs";
import bsky from '@atproto/api'
import * as dotenv from 'dotenv'

dotenv.config();
const { BskyAgent, RichText, } = bsky;
const r = rita.RiTa;
const width = 3072;
const height = 1500;
const canvas = createCanvas(width, height)
const ctx = canvas.getContext('2d')



Array.prototype.pick = function () {
  return this[Math.floor(Math.random() * this.length)];
};

Array.prototype.pickRemove = function () {
  const index = Math.floor(Math.random() * this.length);
  return this.splice(index, 1)[0];
};

function generate() {
  return new Promise((resolve, reject) => {
    const term = r.randomWord("nn").substr(0, 3);
    console.log(term);
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=allcategories&acprefix=${term}&acmin=16&acprop=size&aclimit=500`;
    request(url, (err, resp, body) => {
      let result = JSON.parse(body).query.allcategories;
      result = result.filter(el => {
        let title = el["*"];
        let pos = r.getPosTags(title);
        let hasBannedWord =
          title.includes(" of ") ||
          title.includes(" by ") ||
          title.includes(" articles") ||
          title.includes(" lists") ||
          title.includes("List");
        return (
          el.pages >= 4 &&
          (pos.includes("nns") || pos[0] === "nnps") &&
          !hasBannedWord
        );
      });
      result = result.pick();
      const category = result["*"];
      console.log(category);
      const url2 = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=categorymembers&cmtitle=${"Category:" +
        category}&cmnamespace=0&cmlimit=500`;
      console.log(url2);
      request(url2, (err, resp, body) => {
        let result = JSON.parse(body).query.categorymembers;
        result = result.map(el => el.title.replace(/\s\(.*/, ""));
        let betterResult = result.filter(
          item => item.length <= 32 && !item.includes("List")
        );

        // pick 16 results
        let results = [];
        for (let i = 0; i < 4; i++) {
          results.push(betterResult.pickRemove());
        }
        console.log(results, results.length);
        if (results.includes(undefined)) {
          console.log("BAD RESULT, ABORT");
          process.exit(0);
        }
        makeImage(results, category, function () {
          resolve({ category, results });
        });
      });
    });
  }).catch(e => console.log(e));
}

let colorSchemes = [
  { bg: "#ffffff", fg: "#181818" },
  { bg: "#181818", fg: "#ffffff" },
  { bg: "#1899d5", fg: "#ffffff" },
  { bg: "#f76720", fg: "#ffffff" },
  { bg: "#de3d83", fg: "#ffffff" },
  { bg: "#f54123", fg: "#ffffff" },
  { bg: "#fee94e", fg: "#181818" }
];

function makeImage(names, category, cb) {
  let colorScheme = colorSchemes.pick();
  ctx.fillStyle = colorScheme.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "left";
  ctx.fillStyle = colorScheme.fg;
  ctx.font = "bold 140px Helvetica";
  ctx.fillText(names[0] + "&", width / 8, 512);
  ctx.fillText(names[1] + "&", width / 8, 662);
  ctx.fillText(names[2] + "&", width / 8, 812);
  ctx.fillText(names[3] + ".", width / 8, 962);

  const stream = canvas
    .createPNGStream()
    .pipe(fs.createWriteStream(process.cwd() + "/out.png"));
  stream.on("close", function () {
    console.log("saved png");
    cb();
  });
}

async function start({ category, results }) {
  if (!wordfilter.blacklisted(category)) {
    /* initialize BskyAgent and login  */
    const agent = new BskyAgent({
      service: 'https://bsky.social',
    });
    await agent.login({
      identifier: process.env.BLUESKY_USERNAME,
      password: process.env.BLUESKY_PASSWORD,
    });


    /* call function that generates image with p5.js */
    /* read and upload image generated by getGradientImage() */
    const file = fs.readFileSync('out.png')

    const response = await agent.uploadBlob(file, {
      encoding: "image/jpeg",
    })


    if (!response.success) {
      const msg = `Unable to upload image ${imageUrl}`;
      console.error(msg, response);
      throw new Error(msg);
    }

    const {
      data: { blob: image },
    } = response;


    const rt = new RichText({ text: `${category}` });
    await rt.detectFacets(agent);

    /* create a post with Rich Text and generated image */
    return agent.post({
      text: rt.text,
      facets: rt.facets,
      embed: {
        $type: "app.bsky.embed.images",
        images: [
          {
            image: image,
            alt: `${results[0]} & ${results[1]} & ${results[2]} & ${results[3]}`
          },
        ],
      },
    });
  } else {
    console.log("Word was not approved")
  }
}

generate().then(({ category, results }) => start({ category, results }))