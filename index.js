const { TelegramClient } = require("telegram");
const {StoreSession} = require("telegram/sessions");
const input = require("input");
const { NodeHtmlMarkdown } = require('node-html-markdown')
const config = require('./config')

require('dotenv').config()
const nhm = new NodeHtmlMarkdown(
    /* options (optional) */ {
        emDelimiter:'__'
    },
    /* customTransformers (optional) */ undefined,
    /* customCodeBlockTranslators (optional) */ undefined
);
const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const storeSession = new StoreSession("key"); // fill this later with the value from session.save()

const intervals={};

(async () => {
    console.log("Loading interactive example...");
    const client = new TelegramClient(storeSession, apiId, apiHash, {
        connectionRetries: 5,
    });
    await client.start({
        phoneNumber: async () => await input.text("Please enter your number: "),
        password: async () => await input.text("Please enter your password: "),
        phoneCode: async () =>
            await input.text("Please enter the code you received: "),
        onError: (err) => console.log(err),
    });
    console.log("You should now be connected.");
    client.session.save()
    const data = await fetch('https://raw.githubusercontent.com/neetcode-gh/leetcode/main/.problemSiteData.json')
    const questions = await data.json();
    const blind_questions = questions.filter(ques=>ques.blind75===true||(config.include150&&ques.neetcode150)||config.includeAll)
    console.log('Questions count = ',blind_questions.length)
    if(blind_questions.length===0) {
        console.error('Not enough questions');
        return;
    }
    function getRandomQuestion(fresh, questions){
        if(questions.length===0) return null;
        const id = Math.floor(Math.random()*(questions.length))
        blind_questions[id].sent=true
        return questions[id];
    }
    function getSlugFromQuestion(question){
        return question.link.replace('/','')
    }
    function generateQuestion(title,content,difficulty, link){
        return nhm.translate(`<strong>${title} - (${difficulty})</strong><br/>${link}<br/>`+content)
    }
    async function getQuestionMetadata(slug){
        try{
            const req = await fetch('https://leetcode.com/graphql/',{
                method:'POST',
                headers:{
                    'Content-Type':'application/json'
                },
                body:JSON.stringify({
                    query: `
                    query questionTitle($slug: String!) {
                        question(titleSlug: $slug) {
                            questionId
                            questionFrontendId
                            title
                            titleSlug
                            isPaidOnly
                            difficulty
                            likes
                            dislikes
                            categoryTitle
                            content
                            }
                        }
                    `,
                    variables: {
                        slug
                    },
                    operationName: "questionTitle"
                })
            })
            return req.json()
        }catch (e) {
            console.error(e,slug)
            return {data:null}
        }
    }
    async function sendQuestion(peerId){
        const question = getRandomQuestion(true,blind_questions.filter(ques=>!ques.sent))
        const {data} = await getQuestionMetadata(getSlugFromQuestion(question))
        if(!data) return client.sendMessage("me",{message:JSON.stringify(question)})
        await client.sendMessage(peerId, { message:
                generateQuestion(data.question.title,
                    data.question.content,
                    data.question.difficulty,
                   'https://leetcode.com/problems/'+question.link
                )
        });
    }
    client.addEventHandler((event)=>{
        const eventMessage = event.message
        const message = typeof eventMessage==="string"?eventMessage:eventMessage?.message
        console.log(message,eventMessage)
        const id=eventMessage?.peerId?.userId.value||event?.userId.value
        if(id&&message?.toLowerCase()==='neetcode') {
            sendQuestion(id)
            if(intervals[id]){
                clearInterval(intervals[id])
            }
            intervals[id]=setInterval(()=>sendQuestion(id),config.interval*1000)

        }

    })
})();