I have built a Proof of Concept (POC) of a simple AI chat interface:
https://rmetcalf9.github.io/normangallowayAiinterface/

Aims are:
 - Secured with google log in - named users only
 - Ability to customize interface with own branding
 - Ability to provide the LLM with documents
 - Ability for Terry to customimze system prompts and documents
 - Responses should reference the sources they used

I have looked into openai tools which would allow Terry to customize the system
prompt without code changes:

Assistants
 - Going to be retired. Openai advise to move to agent builder

Agent Builder
 - Can only connect via a simple UI or pre made website widget
 - not possible to implement advanced features such as listing sources and click through

The approach required is to build our own User Interface and connect it to the LLM's.
In that UI we can add 'admin functions' to allow the changes of the system prompt.

So far I have built a simple UI with google login. Currently you can only log in if your google email
address is rmetcalf9@googlemail.com or terry@ngalloway.co.uk

For the POF I deployed this using github pages (a free way of deploying websites)

Can you
 visit https://rmetcalf9.github.io/normangallowayAiinterface/ and confirm you can
  log in with your google account. If you can't let me know your google email
  address as I will need to add it to the allow list
 Setup an open API key in the UI.
