import {Composition} from 'remotion';
import {ZoteroWorkflowVideo} from './ZoteroWorkflowVideo';

export const RemotionRoot = () => {
  return (
    <Composition
      id="ZoteroResearchWorkflow"
      component={ZoteroWorkflowVideo}
      durationInFrames={30 * 30}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
