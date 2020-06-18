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
    const similarOccupations = [];
    const so = ancestor.querySelector(elementName);
    const soDoc = getDocument(so.textContent);
    const soElements = xpathSelect(soDoc, xpath);

    for (i = 0; i < soElements.length; i++) {
        similarOccupations.push(soElements[i].textContent.trim());
    }

    return similarOccupations;
}

function topIndustryParser(ancestor, elementName, xpath) {
    const wesb = ancestor.querySelector(elementName);
    const wesbDoc = getDocument(wesb.textContent);
    const industryList = xpathSelect(wesbDoc, xpath);
    const industryDict = {};

    for (i = 0; i < industryList.length; i += 2) {
        industryDict[industryList[i].textContent] = industryList[i + 1].textContent.replace('%', '');
    }

    return industryDict;
}

function workScheduleParser(ancestor, elementName, rePattern) {
    const wesb = ancestor.querySelector(elementName);
    const wesbMatchable = wesb.textContent.replace(/[\s\t\r\n]+/gm, ' ');
    const match = wesbMatchable.match(rePattern);
    if (match) return match[3];
}

function importantQualityParser(ancestor, elementName, rePattern, xpath) {
    const htbosb = ancestor.querySelector(elementName);
    const matchable = htbosb.textContent.replace(/[\s\t\r\n]+/gm, ' ');
    const match = matchable.match(rePattern);
    if (match) {
        const iqDoc = getDocument(match[4].split('<h3>')[0]);
        const importantQualities = xpathSelect(iqDoc, xpath);
        const iqDict = {};

        importantQualities.forEach(e => {
            const splitPoint = e.textContent.indexOf('. ');
            iqDict[e.textContent.slice(0,splitPoint)] = e.textContent.slice(splitPoint + 2);
        });

        return iqDict;
    }
}

function parseXmlCompilation(myDom) {
    const o = xpathSelect(myDom, '//occupation');

    const r = o.map(occupation => {
        e = {};
        e.title = textElement(occupation, 'title');
        console.log(e.title);

        e.workSchedules = workScheduleParser(occupation, 'work_environment section_body', /<h3>( |<strong>)?Work [Ss]chedules?( |<\/strong>)?<\/h3> ?<p> ?(.+) ?<\/p>/)
        e.importantQualities = importantQualityParser(occupation, 'how_to_become_one section_body', /<h3>( |<strong>)?Important [Qq]ualities?(&nbsp;)?( |<\/strong>)?<\/h3>(.*)/, '//p')

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

        e.topIndustries = topIndustryParser(occupation, 'work_environment section_body', '//td');

        return e;
    });

    // Object.keys(e.importantQualities).some(k => k.length > 26)
    r.filter(e => Object.keys(e.importantQualities).some(k => k.length > 26)).forEach(e => {
        console.log(`Job: ${e.title} Salary: ${e.medianPayAnnual} Growth Rating: ${e.employmentOutlookCode}`);
        //console.log(e.similarOccupations);
        //console.log(e.topIndustries);
        //console.log(e.workSchedules);
        console.log(e.importantQualities);
    });
}

JSDOM.fromFile('xml-compilation.xml')
    .then(dom => dom.window.document)
    .then(myDom => { parseXmlCompilation(myDom); });
