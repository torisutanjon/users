import * as cheerio from "cheerio";
import * as fs from "fs";
import * as cookie from "cookie";
import crypto from "crypto";

const BASE_URL = "https://challenge.sunvoy.com";

const COOKIE_FILE = "cookies.txt";
const OUTPUT_FILE = "users.json";

let savedCookie = "";
if (fs.existsSync(COOKIE_FILE)) {
  savedCookie = fs.readFileSync(COOKIE_FILE, "utf-8");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getNonce(): Promise<string> {
  try {
    const response = await fetch(`${BASE_URL}/login`, {
      method: "GET",
      headers: {
        Cookie: savedCookie,
      },
    });
    const data = await response.text();
    const html = cheerio.load(data);
    const nonce = html('input[name="nonce"]').val();
    console.log("Nonce fetched");
    return nonce as string;
  } catch (error) {
    console.error(`Get nonce error: `, error);
  }
}

async function login(nonce: string): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: BASE_URL,
        Referer: `${BASE_URL}/login`,
      },
      body: new URLSearchParams({
        username: "demo@example.org",
        password: "test",
        nonce,
      }).toString(),
      redirect: "manual",
    });

    if (response.status !== 302) {
      console.error("Unable to login", response.statusText);
      return;
    }

    const cookies = response.headers.getSetCookie();

    const parsed = cookies.map((cookieStr) => cookie.parse(cookieStr));
    savedCookie = parsed
      .map((c) => `${Object.keys(c)[0]}=${Object.values(c)[0]}`)
      .join("; ");

    fs.writeFileSync(COOKIE_FILE, savedCookie);
    console.log("Logged in");
  } catch (error) {
    console.error(`Login error: `, error);
  }
}

async function fetchUserList(): Promise<any[]> {
  try {
    const response = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: {
        Cookie: savedCookie,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!response.ok) {
      console.error("Failed to fetch users", response.status);
    }

    console.log("User list fetched");
    return await response.json();
  } catch (error) {
    console.error("Fetch user list error: ", error);
  }
}

function findCheckCode(data: Record<string, string | string[]>): {
  payload: string;
  checkcode: string;
  fullPayload: string;
  timestamp: number;
} {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadObj = { ...data, timestamp: timestamp.toString() };

  const queryString = Object.keys(payloadObj)
    .sort()
    .map((key) => `${key}=${encodeURIComponent(payloadObj[key])}`)
    .join("&");

  const hmac = crypto.createHmac("sha1", "mys3cr3t");
  hmac.update(queryString);
  const checkcode = hmac.digest("hex").toUpperCase();

  return {
    payload: queryString,
    checkcode,
    fullPayload: `${queryString}&checkcode=${checkcode}`,
    timestamp,
  };
}

async function fetchSettingTokens(): Promise<{}> {
  try {
    const response = await fetch(
      "https://challenge.sunvoy.com/settings/tokens",
      {
        method: "GET",
        headers: {
          Cookie: savedCookie,
        },
      }
    );

    const html = await response.text();
    const $ = cheerio.load(html);

    const data = {
      access_token: $("#access_token").val(),
      openId: $("#openId").val(),
      userId: $("#userId").val(),
      apiuser: $("#apiuser").val(),
      operateId: $("#operateId").val(),
      language: $("#language").val(),
    };

    const signed = findCheckCode(data);

    const buildBody = {
      ...data,
      timestamp: signed.timestamp,
      checkcode: signed.checkcode,
    };

    return buildBody;
  } catch (error) {
    console.error("Fetch setting tokens error: ", error);
  }
}

async function fetchAuthUser(buildBody: any): Promise<void> {
  try {
    const response = await fetch(
      "https://api.challenge.sunvoy.com/api/settings",
      {
        method: "POST",
        headers: {
          "Content-type": "application/json",
        },
        body: JSON.stringify(buildBody),
      }
    );

    const data = await response.json();
    console.log("Auth user fetched");
    return data;
  } catch (error) {
    console.error("Fetch Auth User error:", error);
  }
}

async function saveUsersJson(users: any[], currentUser: any) {
  const output = [...users, { currentUser }];
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
}

async function main() {
  try {
    const nonce = await getNonce();
    await wait(1000);
    await login(nonce);
    const users = await fetchUserList();
    await wait(1000);
    const buildBody = await fetchSettingTokens();
    const currentUser = await fetchAuthUser(buildBody);
    await saveUsersJson(users, currentUser);
  } catch (error) {
    console.error(`Script error:`, error);
  }
}

main();
