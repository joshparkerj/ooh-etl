const fs = require('fs');
const DOMParser = require('dom-parser');
const xpath = require('xpath');
const dom = require('xmldom').DOMParser;
const { JSDOM } = require('jsdom');

// const IN = require(`./${process.argv[2]}`);

function xpathSelect(unparsedDocumentString, xpathSelector) {
    const doc = new dom().parseFromString(unparsedDocumentString);
    return xpath.select(xpathSelector, doc);
}

// mimeType should be text/html or text/xml
function $x(unparsedDocumentString, mimeType, xpath) {
    const domParser = new DOMParser();
    const parsedDocument = domParser.parseFromString(unparsedDocumentString, mimeType);
    const xpathResult = parsedDocument.evaluate(xpath, parsedDocument);
    const results = [];
    let result = xpathResult.iterateNext();
    while (result) {
        results.push(result);
        result = xpathResult.iterateNext();
    }

    return results;
}

function textElement(ancestor, elementName) {
    return ancestor.querySelector(elementName).textContent;
}

function cdataXpath(ancestor, elementName, xpath) {
    const domParser = new DOMParser();

    ancestorDOM = JSDOM.fragment(ancestor.toString());

    const htmlString = textElement(ancestorDOM, elementName);
    const parsedDocument = domParser.parseFromString(htmlString, 'text/html');
    const xpathResult = parsedDocument.evaluate(xpath, parsedDocument);
    let match = xpathResult.iterateNext();
    let innerText = '';
    let numberOfElements = 0;

    while (match) {
        innerText += match.innerText;
        match = xpathResult.iterateNext();
        numberOfElements++;
    }

    if (numberOfElements !== 1) {
        console.log(`The number of elements found for elementName: ${elementName} xpath: ${xpath} was: ${numberOfElements}`);
    }

    return innerText;
}

function cdataParser(ancestor, elementName, xpath, objectName, innerTextName, cb) {
    const domParser = new DOMParser();

    ancestorDOM = JSDOM.fragment(ancestor.toString());

    const htmlString = textElement(ancestorDOM, elementName);
    const parsedDocument = domParser.parseFromString(htmlString, 'text/html');
    const xpathResult = parsedDocument.evaluate(xpath, parsedDocument);
    let match = xpathResult.iterateNext();
    let cdataParsed = {};
    let innerText = '';
    cdataParsed[objectName] = {};

    while (match) {
        innerText += match.innerText;
        cdataParsed = cb(match, cdataParsed);
        match = xpathResult.iterateNext();
    }

    cdataParsed[innerTextName] = innerText;
    return cdataParsed;
}

function payParser(ancestor, elementName, xpath) {
    let pay = cdataParser(ancestor, elementName, xpath, 'pay', 'payText', (match, pay) => {
        let reMatch = match.innerText.match(/The median annual wage for (?<suboccupation>.+) was \$(?<pay>\d+,\d{3})/);
        if (reMatch) {
            pay.pay[reMatch.groups.suboccupation] = +(+((reMatch.groups.pay.replace(',', '')) / 2080).toFixed(2));
        } else {
            reMatch = match.innerText.match(/The median hourly wage for (?<suboccupation>.+) was \$(?<pay>\d+\.\d{2})/);
            if (reMatch) {
                pay.pay[reMatch.groups.suboccupation] = Number(reMatch.groups.pay);
            }
        }

        return pay;
    });

    return pay;
}

function similarOccupationsParser(ancestor, elementName, xpath) {
    return cdataParser(ancestor, elementName, xpath, 'similarOccupation', 'similarOccupations', (match, so) => {
        if (!so.similarOccupation.list) {
            so.similarOccupation.list = [];
        }

        so.similarOccupation.list.push(match.innerText.trim());

        return so;
    });
}

let myFile = '';

fs.readFile('./xml-compilation.xml', (err, data) => {
    if (err) throw err;
    myFile = data.toString();

    const o = xpathSelect(myFile, '//occupation');

    const r = o.map(occupation => {
        e = {};
        occupationDOM = JSDOM.fragment(occupation.toString());
        e.title = textElement(occupationDOM, 'title');
        console.log(e.title);
        if (e.title === 'Military Careers') {
            return e;
        }
        e.description = textElement(occupationDOM, 'description');
        e.medianPayAnnual = +textElement(occupationDOM, 'qf_median_pay_annual value');
        e.medianPayHourly = +textElement(occupationDOM, 'qf_median_pay_hourly value');
        e.education = textElement(occupationDOM, 'qf_entry_level_education value');
        e.workExperience = textElement(occupationDOM, 'qf_work_experience value');
        e.training = textElement(occupationDOM, 'qf_on_the_job_training value');
        e.numberOfJobs = textElement(occupationDOM, 'qf_number_of_jobs value');
        e.employmentOutlook = textElement(occupationDOM, 'qf_employment_outlook description');
        e.employmentOutlookCode = textElement(occupationDOM, 'qf_employment_outlook value');
        e.projectedChangeInNumberOfJobs = textElement(occupationDOM, 'qf_employment_openings value');
        e.whatTheyDo = cdataXpath(occupation, 'summary_what_they_do', '//p');
        e.howToBecomeOne = cdataXpath(occupation, 'summary_how_to_become_one', '//p');
        e.workEnvironment = cdataXpath(occupation, 'summary_work_environment', '//p');

        const pay = payParser(occupation, 'summary_pay', '//p');

        e.payText = pay.payText
        e.pay = pay.pay;

        e.similarOccupations = similarOccupationsParser(occupation, 'similar_occupations section_body', '//td//h4');

        return e;
    });

    r.forEach(e => console.log(`Job: ${e.title} Salary: ${e.medianPayAnnual} Growth Rating: ${e.employmentOutlookCode}`));
});