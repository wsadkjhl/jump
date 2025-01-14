import * as core from '@actions/core'
import * as hwc from '@huaweicloud/huaweicloud-sdk-core'
import * as swr from '@huaweicloud/huaweicloud-sdk-swr/v2/public-api'
import { execSync } from 'child_process'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const project_id = core.getInput('project_id')
    const ak = core.getInput('ak')
    const sk = core.getInput('sk')
    const region = core.getInput('region')
    const ns = core.getInput('ns')
    const repository = core.getInput('repository')
    const tag = core.getInput('tag')

    const registry = 'swr.' + region + '.myhuaweicloud.com'
    const dst_image = `${registry}/${ns}/${repository.replace(/\//g, '_')}:${tag}`

    const client = swr_client(ak, sk, region, project_id)

    const request = new swr.ListRepositoryTagsRequest()
    request.namespace = ns
    request.repository = repository.replace(/\//g, '_')
    request.tag = tag

    try {
      const result = await client.listRepositoryTags(request)
      // const r = result as unknown as Array<string>;
      let r = 0
      if (result instanceof Array) r = result.length
      if (r) {
        core.debug(`ok`)
      } else {
        await swr_login(client, registry)
        swr_pap(repository, tag, dst_image)
      }
    } catch (error) {
      await swr_create_repo(client, ns, repository)
      await swr_login(client, registry)
      swr_pap(repository, tag, dst_image)
      if (error instanceof Error) core.debug(error.message)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

function swr_client(
  ak: string,
  sk: string,
  region: string,
  project_id: string
): swr.SwrClient {
  const endpoint = `https://swr-api.${region}.myhuaweicloud.com`
  const credentials: hwc.BasicCredentials = new hwc.BasicCredentials()
    .withAk(ak)
    .withSk(sk)
    .withProjectId(project_id)

  return swr.SwrClient.newBuilder()
    .withCredential(credentials)
    .withEndpoint(endpoint)
    .build()
}

async function swr_login(
  client: swr.SwrClient,
  registry: string
): Promise<void> {
  const cs_request = new swr.CreateSecretRequest()
  const result: swr.CreateSecretResponse = await client.createSecret(cs_request)

  if (result.httpStatusCode == 200) {
    const cmd = `${result['X-Swr-Dockerlogin']} ${registry}`
    execSync(cmd)
  }
}

function swr_pap(repository: string, tag: string, dst_image: string): void {
  const pout = execSync(`docker pull ${repository}:${tag}`, {
    encoding: 'utf8'
  })
  core.debug(`pull out ${pout}`)
  const tout = execSync(`docker tag ${repository}:${tag} ${dst_image}`, {
    encoding: 'utf8'
  })
  core.debug(`tag out ${tout}`)
  const puout = execSync(`docker push ${dst_image}`, { encoding: 'utf8' })
  core.debug(`push out ${puout}`)
  const rmout = execSync('rm ~/.docker/config.json', { encoding: 'utf8' })
  core.debug(`rm out ${rmout}`)
}

async function swr_create_repo(
  client: swr.SwrClient,
  ns: string,
  repository: string
): Promise<void> {
  const request = new swr.CreateRepoRequest()
  request.namespace = ns
  const body = new swr.CreateRepoRequestBody()
  body.withIsPublic(true)
  body.withRepository(repository.replace(/\//g, '_'))
  request.withBody(body)
  const result = await client.createRepo(request)
  core.debug(`create repo ${result.httpStatusCode}`)
}
