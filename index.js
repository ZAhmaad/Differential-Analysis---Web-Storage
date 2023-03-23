
(async () => {


const sqlite3 = require('sqlite3');
const { firefox, chromium } = require('playwright');
const psl = require('psl');
const { parse: urlparse } = require('url');
const fs = require('fs');
const fsPromises = fs.promises;


const db = new sqlite3.Database('/Users/a/Web-Storage-Diff-Analysis/browser.db');

const browserTypes = ['chrome', 'chromefresh' ,'firefox', 'brave'];

const urls = (await fsPromises.readFile('file2.csv'))
.toString()
.split("\n")
.map((line) => line.split(',')[1]?.trim())
.filter((site) => site);



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
      domain: cookie.cookie.domain,
    }));
     
  
    const thirdPartyCookieItems = thirdPartyCookies.map(cookie => ({
      type: '3rd_party_cookie',
      key: cookie.cookie.name,
      value: cookie.cookie.value,
      domain: cookie.cookie.domain,
    }));
    

    const firstPartyLocalStorageItems = firstPartyLocalStorage.flatMap(obj => {
      return obj.localStorage.map(({ name, value }) => ({
        type: 'Ist_party_local_storage',
        key: name,
        value: value,
        domain: obj.origin,
      }));
    });
    

  
  
    const thirdPartyLocalStorageItems = thirdPartyLocalStorage.flatMap(obj => {
      return obj.localStorage.map(({ name, value }) => ({
        type: '3rd_party_local_storage',
        key: name,
        value: value,
        domain: obj.origin,
      }));
    });
    const allItems = [
      ...Array.isArray(firstPartyCookieItems) ? firstPartyCookieItems : [],
      ...Array.isArray(thirdPartyCookieItems) ? thirdPartyCookieItems : [],
      ...Array.isArray(firstPartyLocalStorageItems) ? firstPartyLocalStorageItems : [],
      ...Array.isArray(thirdPartyLocalStorageItems) ? thirdPartyLocalStorageItems : [],
    ];
  
    return allItems;
  }
  


async function captureStorageState(url, browserType, page) {
  let browser;
  let requestId; // declare requestId
  try {

  if (browserType === 'chrome') {
    page = page || await browser.newPage();
    const response = await page.goto(url);
    await page.waitForTimeout(20000);
    const status_code = response.status();
    const redirect_url = page.url();
    const storageState = await page.context().storageState();
    const allItems = await collectCookiesAndLocalStorageFromStorageState(storageState, redirect_url);
    
    
    

    const requestStmt = db.prepare(`
      INSERT INTO requests (user_agent, url, redirect_url, status_code)
      VALUES (?, ?, ?, ?)
    `);


    requestStmt.run(browserType, url, redirect_url, status_code, function(err) {
      if (err) {
        console.error(err.message);
      } else {
        requestId = this.lastID;

        const cookieStmt = db.prepare(`
          INSERT INTO items (request_id, type, domain, key, value)
          VALUES (?, ?, ?, ?,?)
        `);
        for (const item of allItems) {
          cookieStmt.run(requestId, item['type'], item['domain'], item['key'], item['value']);
        }
      }
    });

      requestStmt.finalize();

 
   
  }else if (browserType === 'chromefresh') {
    const userDataDir = `/Users/a/web-storage/newlibrary/new2${url.replace(/\W/g, '_')}`;
    browser = await chromium.launchPersistentContext(userDataDir, {
      // headless: false,
    });
    page = await browser.newPage();
    const response = await page.goto(url);
    await page.waitForTimeout(20000);
    const status_code = response.status();
    const redirect_url = page.url();
    const storageState = await page.context().storageState();
    const allItems = await collectCookiesAndLocalStorageFromStorageState(storageState, redirect_url);
    
    // const { firstPartyCookieItems, thirdPartyCookieItems, firstPartyLocalStorageItems, thirdPartyLocalStorageItems } = await collectCookiesAndLocalStorageFromStorageState(storageState, url);
    
    

    const requestStmt = db.prepare(`
      INSERT INTO requests (user_agent, url, redirect_url, status_code)
      VALUES (?, ?, ?, ?)
    `);

    
    requestStmt.run(browserType, url, redirect_url, status_code, function(err) {
      if (err) {
        console.error(err.message);
      } else {
        requestId = this.lastID;

        const cookieStmt = db.prepare(`
          INSERT INTO items (request_id, type, domain, key, value)
          VALUES (?, ?, ?, ?,?)
        `);
        

        for (const item of allItems) {
          cookieStmt.run(requestId, item['type'], item['domain'], item['key'], item['value']);
        }
      }
    });


    requestStmt.finalize();

    // await page.goto('about:blank'); // navigate to a blank page to reset the page state
    await page.close();
    await browser.close(); 
  
  
  } else if (browserType === 'firefox') {
    browser = await firefox.launch();
    page = await browser.newPage();
    const response = await page.goto(url);
    await page.waitForTimeout(20000);
    const status_code = response.status();
    const redirect_url = page.url();
    const storageState = await page.context().storageState();
    const allItems = await collectCookiesAndLocalStorageFromStorageState(storageState, redirect_url);
    
    

    const requestStmt = db.prepare(`
      INSERT INTO requests (user_agent, url, redirect_url, status_code)
      VALUES (?, ?, ?, ?)
    `);
    
    
    requestStmt.run(browserType, url, redirect_url, status_code, function(err) {
      if (err) {
        console.error(err.message);
      } else {
        requestId = this.lastID;
    
        const cookieStmt = db.prepare(`
          INSERT INTO items (request_id, type, domain, key, value)
          VALUES (?, ?, ?, ?,?)
        `);
        
        for (const item of allItems) {
          cookieStmt.run(requestId, item['type'],item['domain'], item['key'], item['value']);
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
    page = await browser.newPage();
    const response = await page.goto(url);
    await page.waitForTimeout(20000);
    const status_code = response.status();
    const redirect_url = page.url();
    const storageState = await page.context().storageState();
    const allItems = await collectCookiesAndLocalStorageFromStorageState(storageState, redirect_url);
    
  

    const requestStmt = db.prepare(`
      INSERT INTO requests (user_agent, url, redirect_url, status_code)
      VALUES (?, ?, ?, ?)
    `);
    
    
    requestStmt.run(browserType, url, redirect_url, status_code, function(err) {
      if (err) {
        console.error(err.message);
      } else {
        requestId = this.lastID;
    
        const cookieStmt = db.prepare(`
          INSERT INTO items (request_id, type , domain, key, value)
          VALUES (?, ?, ?, ?,?)
        `);
        
        for (const item of allItems) {
          cookieStmt.run(requestId, item['type'], item['domain'], item['key'], item['value']);
        }
      }
    });
    

    requestStmt.finalize();

    await page.close();
    await browser.close();
  

  
  
  
  } 
} catch(error){ console.error(error.message);
  if (browser) {
    await browser.close();
  }
}
}
  
  


async function captureAll() {

 

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
      domain TEXT,
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
            
          });
          page = page || await browser.newPage();

          await captureStorageState("http://"+ url, 'chrome', page);
          fs.rmdirSync(userDataDir, { recursive: true });
          await captureStorageState("http://" + url, 'chrome', page);

          await page.goto('about:blank'); // navigate to a blank page to reset the page state
          await page.close();
          await browser.close();
        } else if (browserType === 'chromefresh') {
          await captureStorageState("http://" + url, 'chromefresh');
        } 
        else if (browserType === 'firefox') {
          await captureStorageState("http://" + url, 'firefox');
        }
        else if (browserType === 'brave'){
          await captureStorageState("http://" + url, 'brave');
        }
      }catch (error) {
        console.error(`Error processing ${url} with ${browserType}: ${error}`);
       
      }
    }
  }
}

captureAll();
})();
