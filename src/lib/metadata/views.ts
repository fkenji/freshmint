import { registerHelper, registerPartial } from '../generators';
import { Field, HTTPFile, IPFSFile } from './fields';

export class View {
  type: ViewType<any>;
  options: any;

  id: string;
  cadenceTypeString: string;

  constructor(type: ViewType<any>, options: any) {
    this.type = type;
    this.options = options;

    this.id = type.id;
    this.cadenceTypeString = type.cadenceTypeString;
  }
}

export interface ViewType<ViewOptions> {
  (options: ViewOptions): View;
  id: string;
  cadenceTypeString: string;
}

const httpFilePartial = 'http-file';
const ipfsFilePartial = 'ipfs-file';

registerHelper('whichFilePartial', (field) => {
  switch (field.type) {
    case HTTPFile:
      return httpFilePartial;
    case IPFSFile:
      return ipfsFilePartial;
  }

  // TODO: improve error message
  throw 'field must be a file field'
});

registerPartial(httpFilePartial, '../templates/cadence/metadata-views/MetadataViews.HTTPFile.partial.cdc');
registerPartial(ipfsFilePartial, '../templates/cadence/metadata-views/MetadataViews.IPFSFile.partial.cdc');

export function defineView<ViewOptions>({
  id,
  cadenceTypeString,
  cadenceTemplatePath,
}: {
  id: string;
  cadenceTypeString: string;
  cadenceTemplatePath: string;
}): ViewType<ViewOptions> {
  const viewType = (options: ViewOptions): View => {
    return new View(viewType, options);
  };

  viewType.id = id;
  viewType.cadenceTypeString = cadenceTypeString;

  registerPartial(id, cadenceTemplatePath);

  return viewType;
}

export const DisplayView = defineView<{
  name: Field;
  description: Field;
  thumbnail: Field;
}>({
  id: 'display',
  cadenceTypeString: 'Type<MetadataViews.Display>()',
  cadenceTemplatePath: '../templates/cadence/metadata-views/MetadataViews.Display.partial.cdc',
});

export const MediaView = defineView<{
  file: Field;
  mediaType: string;
}>({
  id: 'media',
  cadenceTypeString: 'Type<MetadataViews.Media>()',
  cadenceTemplatePath: '../templates/cadence/metadata-views/MetadataViews.Media.partial.cdc',
});

export const viewsTypes: ViewType<any>[] = [DisplayView, MediaView];

const viewsTypesById: { [key: string]: ViewType<any> } = viewsTypes.reduce(
  (views, view) => ({ [view.id]: view, ...views }),
  {},
);

function getViewTypeById(id: string): ViewType<any> {
  return viewsTypesById[id];
}

export type ViewInput = { type: string; options: any };

export function parseViews(views: ViewInput[]): View[] {
  return views.map((view: ViewInput) => {
    const viewType = getViewTypeById(view.type);
    return viewType(view.options);
  });
}
