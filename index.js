const { JSDOM } = require('jsdom');

function getDocument(htmlString) {
    return new JSDOM(htmlString).window.document;
}

function xpathSelect(dom, xpath) {
    const xpathResult = dom.evaluate(xpath, dom, null, 0);
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
    const htmlString = textElement(ancestor, elementName);
    const parsedDocument = getDocument(htmlString);
    const xpathResult = xpathSelect(parsedDocument, xpath);
    let innerText = '';

    xpathResult.forEach(result => {
        innerText += result.textContent;
    });

    if (xpathResult.length !== 1) {
        console.log(`The number of elements found for elementName: ${elementName} xpath: ${xpath} was: ${xpathResult.length}`);
    }

    return innerText;
}

function cdataParser(ancestor, elementName, xpath, objectName, innerTextName, cb) {
    const htmlString = textElement(ancestor, elementName);
    const parsedDocument = getDocument(htmlString);
    const xpathResult = xpathSelect(parsedDocument, xpath);
    let cdataParsed = {};
    let innerText = '';
    cdataParsed[objectName] = {};

    xpathResult.forEach(result => {
        innerText += result.textContent;
        cdataParsed = cb(result, cdataParsed);
    })

    cdataParsed[innerTextName] = innerText;
    return cdataParsed;
}

function payParser(ancestor, elementName, xpath) {
    let pay = cdataParser(ancestor, elementName, xpath, 'pay', 'payText', (match, pay) => {
        let reMatch = match.textContent.match(/The median annual wage for (?<suboccupation>.+) was \$(?<pay>\d+,\d{3})/);
        if (reMatch) {
            pay.pay[reMatch.groups.suboccupation] = +(+((reMatch.groups.pay.replace(',', '')) / 2080).toFixed(2));
        } else {
            reMatch = match.textContent.match(/The median hourly wage for (?<suboccupation>.+) was \$(?<pay>\d+\.\d{2})/);
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

        so.similarOccupation.list.push(match.textContent.trim());

        return so;
    });
}

function parseXmlCompilation(myDom) {
    const o = xpathSelect(myDom, '//occupation');

    const r = o.map(occupation => {
        e = {};
        e.title = textElement(occupation, 'title');
        console.log(e.title);
        if (e.title === 'Military Careers') {
            return e;
        }

        e.description = textElement(occupation, 'description');
        e.medianPayAnnual = +textElement(occupation, 'qf_median_pay_annual value');
        e.medianPayHourly = +textElement(occupation, 'qf_median_pay_hourly value');
        e.education = textElement(occupation, 'qf_entry_level_education value');
        e.workExperience = textElement(occupation, 'qf_work_experience value');
        e.training = textElement(occupation, 'qf_on_the_job_training value');
        e.numberOfJobs = textElement(occupation, 'qf_number_of_jobs value');
        e.employmentOutlook = textElement(occupation, 'qf_employment_outlook description');
        e.employmentOutlookCode = textElement(occupation, 'qf_employment_outlook value');
        e.projectedChangeInNumberOfJobs = textElement(occupation, 'qf_employment_openings value');
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
}

JSDOM.fromFile('xml-compilation.xml')
    .then(dom => dom.window.document)
    .then(myDom => { parseXmlCompilation(myDom); });
