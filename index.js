


const sqlite3 = require('sqlite3');

const { firefox, chromium } = require('playwright');
const psl = require('psl');

const { parse: urlparse } = require('url');
const fs = require('fs');


function extractHostname(url) {
  let hostname;
  //find & remove protocol (http, ftp, etc.) and get hostname
  if (url.indexOf('//') > -1) {
    hostname = url.split('/')[2];
  } else {
    hostname = url.split('/')[0];
  }
  //find & remove port number
  hostname = hostname.split(':')[0];
  //find & remove "?"
  hostname = hostname.split('?')[0];

  return hostname;
}

function extractDomain(url) {
  let domain = '';
  try {
    const urlObj = new URL(url);
    domain = psl.get(extractHostname(urlObj.hostname));
  } catch (err) {
    if (url.startsWith('.')) {
      domain = psl.get(url.slice(1));
    } else {
      console.error(err);
    }
  }
  return domain;

}

function extractETLDPlus1(url) {
  const parsedUrl = urlparse(url);
  const domainParts = parsedUrl.hostname.split('.');
  const etldPlus1 = domainParts.slice(-2).join('.');
  return etldPlus1;
}


  
async function collectCookiesAndLocalStorageFromStorageState(storageState, url) {
    const urlDomain = extractDomain(url);
    const urlETLDPlus1 = extractETLDPlus1(url);
  
    const firstPartyCookies = [];
    const thirdPartyCookies = [];
    const firstPartyLocalStorage = [];
    const thirdPartyLocalStorage = [];
  
    storageState.cookies.forEach(cookie => {
      const cookieObj = { domain: cookie.domain, cookie: cookie };
      const cookieETLDPlus1 = extractETLDPlus1(`https://${cookie.domain}`);
      if (cookieETLDPlus1 === urlETLDPlus1) {
        firstPartyCookies.push(cookieObj);
      } else {
        thirdPartyCookies.push(cookieObj);
      }
    });
  
    storageState.origins.forEach(origin => {
      const domain = extractDomain(origin.origin);
      const localStorage = origin.localStorage || null;
  
      if (localStorage) {
        const localStorageObj = { origin: origin.origin, localStorage: localStorage };
        const isSameETLDPlus1 = domain === urlDomain;
        if (isSameETLDPlus1) {
          firstPartyLocalStorage.push(localStorageObj);
        } else {
          thirdPartyLocalStorage.push(localStorageObj);
        }
      }
    });
  
    const firstPartyCookieItems = firstPartyCookies.map(cookie => ({
      type: 'Ist_party_cookie',
      key: cookie.cookie.name,
      value: cookie.cookie.value,
    }));
    // console.log(firstPartyCookieItems);
  
    const thirdPartyCookieItems = thirdPartyCookies.map(cookie => ({
      type: '3rd_party_cookie',
      key: cookie.cookie.name,
      value: cookie.cookie.value,
    }));
    // console.log(thirdPartyCookieItems);

    const firstPartyLocalStorageItems = firstPartyLocalStorage.flatMap(obj => {
      return obj.localStorage.map(({ name, value }) => ({
        type: 'Ist_party_local_storage',
        key: name,
        value: value,
      }));
    });
    

  
  
    // console.log(firstPartyLocalStorageItems);
  
    const thirdPartyLocalStorageItems = thirdPartyLocalStorage.flatMap(obj => {
      return obj.localStorage.map(({ name, value }) => ({
        type: '3rd_party_local_storage',
        key: name,
        value: value,
      }));
    });
  
    return {
      firstPartyCookieItems: firstPartyCookieItems,
      thirdPartyCookieItems: thirdPartyCookieItems,
      firstPartyLocalStorageItems: firstPartyLocalStorageItems,
      thirdPartyLocalStorageItems: thirdPartyLocalStorageItems
    };
  }
  


async function captureStorageState(url, browserType, page) {
  let browser;
  let requestId; // declare requestId
  if (browserType === 'chrome') {
    page = page || await browser.newPage();
    await page.goto(url);
    await page.waitForTimeout(5000);
    const storageState = await page.context().storageState();
    const { firstPartyCookieItems, thirdPartyCookieItems, firstPartyLocalStorageItems, thirdPartyLocalStorageItems } = await collectCookiesAndLocalStorageFromStorageState(storageState, url);
    
    // console.log(firstPartyLocalStorageItems);
    const db = new sqlite3.Database('final5.db');

    const requestStmt = db.prepare(`
      INSERT INTO requests (user_agent, url, redirect_url, status_code)
      VALUES (?, ?, ?, ?)
    `);


    requestStmt.run(browserType, url, null, 200, function(err) {
      if (err) {
        console.error(err.message);
      } else {
        requestId = this.lastID;

        const cookieStmt = db.prepare(`
          INSERT INTO items (request_id, type, key, value)
          VALUES (?, ?, ?, ?)
        `);

        

        const allItems = [
          ...Array.isArray(firstPartyCookieItems) ? firstPartyCookieItems : [],
          ...Array.isArray(thirdPartyCookieItems) ? thirdPartyCookieItems : [],
          ...Array.isArray(firstPartyLocalStorageItems) ? firstPartyLocalStorageItems : [],
          ...Array.isArray(thirdPartyLocalStorageItems) ? thirdPartyLocalStorageItems : [],
        ];

        for (const item of allItems) {
          cookieStmt.run(requestId, item['type'], item['key'], item['value']);
        }
      }
    });

      requestStmt.finalize();
    
      
    

 
   
  }else if (browserType === 'chromefresh') {
    const userDataDir = `/Users/a/web-storage/newlibrary/new2${url.replace(/\W/g, '_')}`;
    browser = await chromium.launchPersistentContext(userDataDir, {
      // headless: false,
      // additional options for context can be passed here
    });
    page = page || await browser.newPage();
    await page.goto(url);
    await page.waitForTimeout(5000);
    const storageState = await page.context().storageState();
    
    const { firstPartyCookieItems, thirdPartyCookieItems, firstPartyLocalStorageItems, thirdPartyLocalStorageItems } = await collectCookiesAndLocalStorageFromStorageState(storageState, url);
    
    const db = new sqlite3.Database('final5.db');

    const requestStmt = db.prepare(`
      INSERT INTO requests (user_agent, url, redirect_url, status_code)
      VALUES (?, ?, ?, ?)
    `);

    
    requestStmt.run(browserType, url, null, 200, function(err) {
      if (err) {
        console.error(err.message);
      } else {
        requestId = this.lastID;

        const cookieStmt = db.prepare(`
          INSERT INTO items (request_id, type, key, value)
          VALUES (?, ?, ?, ?)
        `);
        

        const allItems = [
          ...Array.isArray(firstPartyCookieItems) ? firstPartyCookieItems : [],
          ...Array.isArray(thirdPartyCookieItems) ? thirdPartyCookieItems : [],
          ...Array.isArray(firstPartyLocalStorageItems) ? firstPartyLocalStorageItems : [],
          ...Array.isArray(thirdPartyLocalStorageItems) ? thirdPartyLocalStorageItems : [],
        ];
        

        for (const item of allItems) {
          cookieStmt.run(requestId, item['type'], item['key'], item['value']);
        }
      }
    });


    requestStmt.finalize();

    await page.goto('about:blank'); // navigate to a blank page to reset the page state
    await page.close();
    await browser.close(); 
  
  
  } else if (browserType === 'firefox') {
    browser = await firefox.launch();
    page = page || await browser.newPage();
    await page.goto(url);
    await page.waitForTimeout(5000);
    const storageState = await page.context().storageState();
    
    const { firstPartyCookieItems, thirdPartyCookieItems, firstPartyLocalStorageItems, thirdPartyLocalStorageItems } = await collectCookiesAndLocalStorageFromStorageState(storageState, url);
    const db = new sqlite3.Database('final5.db');

    const requestStmt = db.prepare(`
      INSERT INTO requests (user_agent, url, redirect_url, status_code)
      VALUES (?, ?, ?, ?)
    `);
    
    
    requestStmt.run(browserType, url, null, 200, function(err) {
      if (err) {
        console.error(err.message);
      } else {
        requestId = this.lastID;
    
        const cookieStmt = db.prepare(`
          INSERT INTO items (request_id, type, key, value)
          VALUES (?, ?, ?, ?)
        `);
    
        const allItems = [
          ...Array.isArray(firstPartyCookieItems) ? firstPartyCookieItems : [],
          ...Array.isArray(thirdPartyCookieItems) ? thirdPartyCookieItems : [],
          ...Array.isArray(firstPartyLocalStorageItems) ? firstPartyLocalStorageItems : [],
          ...Array.isArray(thirdPartyLocalStorageItems) ? thirdPartyLocalStorageItems : [],
        ];
        
        for (const item of allItems) {
          cookieStmt.run(requestId, item['type'], item['key'], item['value']);
        }
      }
    });
    

    requestStmt.finalize();

    await page.close();
    await browser.close();
  

  

  
  } else if (browserType === 'brave') {
    browser = await chromium.launch({
       headless: false,
      executablePath: '/Applications/Brave Browser 3.app/Contents/MacOS/Brave Browser',
    });
    page = page || await browser.newPage();
    await page.goto(url);
    await page.waitForTimeout(5000);
    const storageState = await page.context().storageState();
    
    const { firstPartyCookieItems, thirdPartyCookieItems, firstPartyLocalStorageItems, thirdPartyLocalStorageItems } = await collectCookiesAndLocalStorageFromStorageState(storageState, url);
    const db = new sqlite3.Database('final5.db');

    const requestStmt = db.prepare(`
      INSERT INTO requests (user_agent, url, redirect_url, status_code)
      VALUES (?, ?, ?, ?)
    `);
    
    
    requestStmt.run(browserType, url, null, 200, function(err) {
      if (err) {
        console.error(err.message);
      } else {
        requestId = this.lastID;
    
        const cookieStmt = db.prepare(`
          INSERT INTO items (request_id, type, key, value)
          VALUES (?, ?, ?, ?)
        `);
    
        const allItems = [
          ...Array.isArray(firstPartyCookieItems) ? firstPartyCookieItems : [],
          ...Array.isArray(thirdPartyCookieItems) ? thirdPartyCookieItems : [],
          ...Array.isArray(firstPartyLocalStorageItems) ? firstPartyLocalStorageItems : [],
          ...Array.isArray(thirdPartyLocalStorageItems) ? thirdPartyLocalStorageItems : [],
        ];
        
        for (const item of allItems) {
          cookieStmt.run(requestId, item['type'], item['key'], item['value']);
        }
      }
    });
    

    requestStmt.finalize();

    await page.close();
    await browser.close();
  

  

  
  } 
  
  
  else {
    throw new Error(`Invalid browser type: ${browserType}`);
  }
  return {browser, page }
}

// const urls = ['https://www.nytimes.com', "https://www.akamai.net", 'https://www.bbc.com', "https://linkedin.com", "https://microsoft.com", "https://live.com", "https://reddit.com", "https://wordpress.org", "https://vimeo.com", "https://yandex.ru","https://cloudflare.com",  "https://a-msedge.net", "https://googleusercontent.com","https://trafficmanager.net","https://tribune.com.pk", 'https://stackoverflow.com'];
const browserTypes = ['chrome', 'chromefresh' ,'firefox', 'brave'];
const urls = ['https://www.bbc.com'];

async function captureAll() {

  const db = new sqlite3.Database('final5.db');

  // Create the tables
  db.run(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY,
      user_agent VARCHAR(50) NOT NULL,
      url VARCHAR(2048) NOT NULL,
      redirect_url VARCHAR(2048),
      status_code INTEGER NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY,
      request_id INTEGER ,
      type TEXT NOT NULL CHECK (type IN ('Ist_party_cookie', '3rd_party_cookie', 'Ist_party_local_storage', '3rd_party_local_storage')),
      key TEXT ,
      value TEXT  ,
      FOREIGN KEY (request_id) REFERENCES requests (id)
    )
  `);

  for (const url of urls) {
    let page;
    for (const browserType of browserTypes) {
      console.log(browserType, url);
      try {
        if (browserType === 'chrome') {
          // reuse the same page instance for the Chrome browser and visit the page twice
          const userDataDir = `/Users/a/web-storage/newlibrary/new2${url.replace(/\W/g, '_')}`;
          const browser = await chromium.launchPersistentContext(userDataDir, {
            // headless: false,
            // additional options for context can be passed here
          });
          page = page || await browser.newPage();

          await captureStorageState(url, 'chrome', page);
          await captureStorageState(url, 'chrome', page);

          await page.goto('about:blank'); // navigate to a blank page to reset the page state
          await page.close();
          await browser.close();
        } else if (browserType === 'chromefresh') {
          await captureStorageState(url, 'chromefresh');
        } 
        else if (browserType === 'firefox') {
          await captureStorageState(url, 'firefox');
        }
        else if (browserType === 'brave'){
          await captureStorageState(url, 'brave');
        }
      }catch (error) {
        console.error(`Error processing ${url} with ${browserType}: ${error}`);
      }
    }
  }
}

captureAll();
